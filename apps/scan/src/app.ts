import {
  HOLD_CAPTURE_MS,
  DETECT_INTERVAL_MS,
  SKIN_SAMPLE_MAX,
  averageSkinSamples,
  faceChecks,
  lightingOk,
  recommendShades,
  resolveVariantLinks,
  rgbToLab,
  skinFromLandmarks,
  type FaceGates,
  type FeedbackChoice,
  type Lab,
  type Landmark,
  type PublicFinder,
  type RecommendedShade,
  type Rgb,
  type Undertone,
} from '@tryon/shared';
import type { Tracker } from './tracker';
import { drawVideoFrame, getVideoLandmarker, requestCameraStream, resetVideoLandmarker } from './vision';

type Variant = PublicFinder['variants'][number];
type Match = RecommendedShade<Variant>;

const BACK_ICON =
  '<svg class="fm-pdp__nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square" stroke-linejoin="miter"></path></svg>';
const CLOSE_ICON =
  '<svg class="fm-pdp__nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"></path></svg>';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(className: string, text?: string, attrs: Record<string, string> = {}): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function paragraphs(text: string): HTMLParagraphElement[] {
  return text
    .split(/\n{2,}|\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => el('p', '', line));
}

export class ShadeFinderApp {
  private readonly finder: PublicFinder;
  private readonly tracker: Tracker;
  private readonly labels: PublicFinder['settings']['labels'];

  private fallback!: HTMLElement;
  private fallbackMessage!: HTMLElement;
  private overlay!: HTMLElement;
  private privacy: HTMLElement | null = null;
  private drawer!: HTMLElement;
  private back!: HTMLButtonElement;
  private video!: HTMLVideoElement;
  private canvas!: HTMLCanvasElement;
  private countdown!: HTMLElement;
  private status!: HTMLElement;
  private results!: HTMLElement;
  private feedback!: HTMLElement;

  private open = false;
  private skinLab: Lab | null = null;
  private undertone: Undertone | null = null;
  private matches: Match[] = [];
  private selected = 0;
  private stream: MediaStream | null = null;
  private cameraToken = 0;
  private scanning = false;
  private busy = false;
  private captured = false;
  private landmarkerReset = false;
  private holdReadyAt = 0;
  private skinSamples: Rgb[] = [];
  private lastPixels: ImageData | null = null;
  private videoTime = 0;
  private lastDetect = 0;
  private frame = 0;
  private liveAt = 0;
  private feedbackTimer = 0;
  private feedbackDone = false;

  constructor(root: HTMLElement, finder: PublicFinder, tracker: Tracker) {
    this.finder = finder;
    this.tracker = tracker;
    this.labels = finder.settings.labels;
    root.replaceChildren(this.build());
    document.title = finder.title;
    document.addEventListener('keydown', this.onKey);
  }

  /** Opens straight into privacy consent, or the camera when no privacy note is set. */
  start(): void {
    this.tracker.track('page_view');
    getVideoLandmarker().catch(() => {});
    this.setOpen(true);
  }

  /** Dev-only: skip the camera and continue as if this skin color was captured. */
  debugCapture(rgb: Rgb): void {
    this.open = true;
    document.documentElement.classList.add('fm-pdp-lock');
    this.overlay.hidden = false;
    if (this.privacy) this.privacy.hidden = true;
    this.stopCamera();
    this.drawer.hidden = false;
    this.drawer.classList.remove('is-rescan');
    this.drawer.classList.add('is-open', 'is-live');
    this.skinLab = rgbToLab(rgb.r, rgb.g, rgb.b);
    if (this.undertoneEnabled()) {
      this.showUndertoneStep();
      return;
    }
    this.recommend();
  }

  // ---------------------------------------------------------------- DOM

  private build(): HTMLElement {
    const { settings } = this.finder;
    const host = el('div', 'fm-pdp fm-page');

    this.fallback = el('main', 'fm-page__fallback');
    this.fallback.hidden = true;
    const explain = el(
      'p',
      'fm-page__fallback-text',
      'Finding your shade needs the camera. The picture stays on your phone and is never uploaded. If you closed the prompt or blocked the camera, tap below to try again.'
    );
    this.fallbackMessage = el('p', 'fm-page__fallback-text');
    this.fallbackMessage.setAttribute('role', 'status');
    this.fallbackMessage.hidden = true;
    const again = button('fm-page__fallback-btn', this.labels.scanAgain);
    again.addEventListener('click', () => this.setOpen(true));
    this.fallback.append(explain, this.fallbackMessage, again);

    this.overlay = el('div', 'fm-pdp__overlay');
    this.overlay.hidden = true;
    this.overlay.dataset.fmClose = '';

    this.privacy = settings.privacy.note.trim() ? this.buildPrivacy() : null;
    this.drawer = this.buildDrawer();
    this.feedback = this.buildFeedback();

    [this.overlay, this.privacy, this.drawer].forEach((node) => node?.addEventListener('click', this.onCloseClick));

    host.append(this.fallback, this.overlay);
    if (this.privacy) host.appendChild(this.privacy);
    host.append(this.drawer, this.feedback);
    return host;
  }

  private buildPrivacy(): HTMLElement {
    const { privacy } = this.finder.settings;
    const node = el('div', 'fm-pdp__privacy');
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.setAttribute('aria-label', privacy.confirmLabel);
    node.hidden = true;
    node.appendChild(button('fm-pdp__close fm-pdp__popup-close', '×', { 'data-fm-close': '', 'aria-label': 'Close' }));
    const body = el('div', 'fm-pdp__privacy-body');
    body.append(...paragraphs(privacy.note));
    node.appendChild(body);
    const accept = button('fm-pdp__privacy-accept', privacy.confirmLabel);
    accept.addEventListener('click', this.onPrivacyAccept);
    node.appendChild(accept);
    return node;
  }

  private buildDrawer(): HTMLElement {
    const drawer = el('div', 'fm-pdp__drawer');
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', this.finder.title);
    drawer.hidden = true;

    this.back = button('fm-pdp__nav-btn fm-pdp__back', undefined, { 'aria-label': 'Back' });
    this.back.innerHTML = BACK_ICON;
    this.back.hidden = true;
    this.back.addEventListener('click', this.onBack);
    const close = button('fm-pdp__nav-btn fm-pdp__result-close', undefined, { 'data-fm-close': '', 'aria-label': 'Close' });
    close.innerHTML = CLOSE_ICON;

    const photo = el('div', 'fm-pdp__photo');
    const stage = el('div', 'fm-pdp__stage');
    this.video = el('video', 'fm-pdp__video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
    this.video.hidden = true;
    this.canvas = el('canvas', 'fm-pdp__canvas');
    this.canvas.hidden = true;
    this.countdown = el('div', 'fm-pdp__countdown');
    this.countdown.hidden = true;
    this.countdown.setAttribute('aria-hidden', 'true');
    const loading = el('div', 'fm-pdp__loading');
    loading.appendChild(el('span', 'fm-pdp__spinner'));
    stage.append(this.video, this.canvas, el('div', 'fm-pdp__guide'), this.countdown, loading);

    const gates = el('ul', 'fm-pdp__gates');
    (
      [
        ['lighting', this.labels.gateLighting],
        ['straight', this.labels.gateStraight],
        ['position', this.labels.gatePosition],
      ] as const
    ).forEach(([gate, name]) => {
      const item = el('li');
      item.dataset.fmGate = gate;
      item.append(el('span', 'fm-pdp__gate-name', name), el('span', 'fm-pdp__gate-state', 'False'));
      gates.appendChild(item);
    });

    this.status = el('p', 'fm-pdp__status');
    this.status.setAttribute('role', 'status');
    photo.append(stage, el('p', 'fm-pdp__hold', this.labels.holdHint), gates, this.status);

    this.results = el('div', 'fm-pdp__results');
    drawer.append(this.back, close, photo, this.results);
    return drawer;
  }

  private buildFeedback(): HTMLElement {
    const node = el('div', 'fm-pdp__feedback');
    node.hidden = true;
    const dialog = el('div', 'fm-pdp__feedback-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const header = el('div', 'fm-pdp__feedback-header');
    const title = el('p', 'fm-pdp__feedback-title', this.finder.settings.feedback.title || 'How is the shade depth?');
    const close = button('fm-pdp__feedback-close', '×', { 'aria-label': 'Close' });
    close.addEventListener('click', () => {
      this.tracker.track('feedback_dismiss', { recommended: this.recommendedSlots() });
      this.dismissFeedback();
    });
    header.append(title, close);
    const options = el('div', 'fm-pdp__feedback-options');
    const config = this.finder.settings.feedback;
    (
      [
        ['too_light', config.lighterLabel || 'Too light', 'fm-pdp__feedback-option'],
        ['just_right', config.justRightLabel || 'Just right', 'fm-pdp__feedback-option is-primary'],
        ['too_deep', config.deeperLabel || 'Too deep', 'fm-pdp__feedback-option'],
      ] as [FeedbackChoice, string, string][]
    ).forEach(([choice, label, className]) => {
      const option = button(className, label);
      option.addEventListener('click', () => {
        this.tracker.track('feedback', { feedback: choice, recommended: this.recommendedSlots() });
        this.dismissFeedback();
      });
      options.appendChild(option);
    });
    dialog.append(header, options);
    node.append(el('div', 'fm-pdp__feedback-mask'), dialog);
    return node;
  }

  // ---------------------------------------------------------------- open / close

  private onBack = () => {
    this.undertone = null;
    this.startCamera();
  };

  private onCloseClick = (event: Event) => {
    if ((event.target as Element).closest('[data-fm-close]')) this.setOpen(false);
  };

  private onPrivacyAccept = () => {
    this.tracker.track('privacy_accept');
    if (this.privacy) this.privacy.hidden = true;
    this.drawer.hidden = false;
    this.drawer.classList.add('is-open');
    this.drawer.querySelector<HTMLElement>('[data-fm-close]')?.focus();
    this.startCamera();
  };

  private onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.open) return;
    if (!this.feedback.hidden) {
      this.dismissFeedback();
      return;
    }
    this.setOpen(false);
  };

  private setOpen(open: boolean) {
    this.open = open;
    document.documentElement.classList.toggle('fm-pdp-lock', open);
    if (!open) {
      this.undertone = null;
      this.clearFeedback(true);
      this.drawer.hidden = true;
      this.drawer.classList.remove('is-open', 'is-ready', 'is-undertone', 'is-rescan');
      this.back.hidden = true;
      if (this.privacy) this.privacy.hidden = true;
      this.overlay.hidden = true;
      this.stopCamera();
      this.fallbackMessage.textContent = '';
      this.fallbackMessage.hidden = true;
      this.fallback.hidden = false;
      this.fallback.querySelector<HTMLElement>('button')?.focus();
      return;
    }
    this.fallback.hidden = true;
    this.overlay.hidden = false;
    const showPrivacy = Boolean(this.privacy);
    this.drawer.hidden = showPrivacy;
    this.drawer.classList.toggle('is-open', !showPrivacy);
    if (this.privacy) this.privacy.hidden = !showPrivacy;
    if (showPrivacy) {
      this.privacy?.querySelector<HTMLElement>('.fm-pdp__privacy-accept')?.focus();
      return;
    }
    this.drawer.querySelector<HTMLElement>('[data-fm-close]')?.focus();
    this.startCamera();
  }

  private setNotice(text: string) {
    this.fallbackMessage.textContent = text;
    this.fallbackMessage.hidden = !text;
    this.fallback.hidden = false;
  }

  // ---------------------------------------------------------------- feedback

  private feedbackEnabled(): boolean {
    return Boolean(this.finder.settings.feedback.enabled);
  }

  private feedbackDelayMs(): number {
    const seconds = Number(this.finder.settings.feedback.delaySeconds);
    const clamped = Number.isFinite(seconds) ? Math.min(5, Math.max(3, seconds)) : 4;
    return clamped * 1000;
  }

  private clearFeedback(resetDone = false) {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = 0;
    }
    this.feedback.hidden = true;
    if (resetDone) this.feedbackDone = false;
  }

  private dismissFeedback() {
    this.feedbackDone = true;
    this.clearFeedback();
  }

  private scheduleFeedback() {
    this.clearFeedback(true);
    if (!this.feedbackEnabled() || !this.matches.length) return;
    this.feedbackTimer = window.setTimeout(() => this.showFeedback(), this.feedbackDelayMs());
  }

  private showFeedback() {
    this.feedbackTimer = 0;
    if (!this.open || this.feedbackDone || !this.feedbackEnabled() || !this.matches.length) return;
    this.feedback.hidden = false;
    this.feedback.querySelector<HTMLElement>('.fm-pdp__feedback-close')?.focus();
  }

  // ---------------------------------------------------------------- camera

  private startCamera() {
    // Instantly cover/hide the result sheet before removing is-ready (avoids grow-to-fullscreen).
    this.clearFeedback(true);
    this.drawer.classList.add('is-rescan');
    this.stopCamera();
    const token = this.cameraToken;
    this.captured = false;
    this.holdReadyAt = 0;
    this.skinSamples = [];
    this.lastPixels = null;
    this.setCountdown('');
    this.skinLab = null;
    this.undertone = null;
    this.drawer.classList.remove('is-live', 'is-ready', 'is-undertone');
    this.back.hidden = true;
    this.canvas.hidden = true;
    this.results.replaceChildren();
    this.matches = [];
    this.paintGates({ lighting: false, straight: false, position: false });
    if (!navigator.mediaDevices?.getUserMedia) {
      this.drawer.classList.remove('is-rescan');
      this.tracker.track('camera_denied');
      this.setOpen(false);
      this.setNotice(this.labels.cameraDenied);
      return;
    }
    this.landmarkerReset = false;
    // Auto-prompt immediately. Deny once → leave the camera and show the message.
    const modelReady = getVideoLandmarker().catch(() => getVideoLandmarker());
    requestCameraStream()
      .then(async (stream) => {
        if (token !== this.cameraToken || !this.open) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        this.tracker.track('camera_granted');
        this.stream = stream;
        const video = this.video;
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        video.hidden = false;
        this.canvas.hidden = false;
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (this.scanning && this.open) this.setOpen(false);
        });
        await video.play();
        if (token !== this.cameraToken || !this.open) return;
        try {
          await modelReady;
        } catch {
          if (token !== this.cameraToken || !this.open) return;
          this.drawer.classList.remove('is-rescan');
          this.setStatus(this.labels.manualPick);
          return;
        }
        if (token !== this.cameraToken || !this.open) return;
        await new Promise<void>((resolve) => {
          if (typeof video.requestVideoFrameCallback === 'function') {
            video.requestVideoFrameCallback(() => resolve());
          } else {
            setTimeout(resolve, 200);
          }
        });
        if (token !== this.cameraToken || !this.open) return;
        this.drawer.classList.remove('is-rescan');
        this.drawer.classList.add('is-live');
        this.liveAt = performance.now();
        this.scanning = true;
        this.drawer.classList.add('is-scanning');
        this.loop();
      })
      .catch(() => {
        if (token !== this.cameraToken || !this.open) return;
        this.drawer.classList.remove('is-rescan');
        this.tracker.track('camera_denied');
        this.setOpen(false);
        this.setNotice(this.labels.cameraDenied);
      });
  }

  private stopCamera() {
    this.cameraToken += 1;
    this.scanning = false;
    this.busy = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.video.hidden = true;
    this.drawer.classList.remove('is-scanning');
  }

  private loop = () => {
    if (!this.scanning) return;
    const now = performance.now();
    if (!this.busy && now - this.lastDetect >= DETECT_INTERVAL_MS) {
      this.lastDetect = now;
      void this.detectFrame();
    }
    this.frame = requestAnimationFrame(this.loop);
  };

  private async detectFrame() {
    if (!this.scanning || this.busy) return;
    const video = this.video;
    if (video.readyState < 2 || !video.videoWidth) return;
    this.busy = true;
    try {
      const landmarker = await getVideoLandmarker();
      if (!this.scanning) return;
      const pixels = drawVideoFrame(video, this.canvas);
      this.lastPixels = pixels;
      const stamp = Math.max(performance.now(), this.videoTime + 1);
      this.videoTime = stamp;
      const result = landmarker.detectForVideo(video, stamp);
      const faces: Landmark[][] = result?.faceLandmarks || [];
      const landmarks = faces[0];
      const pose = faceChecks(landmarks, faces.slice(1));
      const lighting = landmarks ? lightingOk(pixels, landmarks) : false;
      this.paintGates({ lighting, straight: pose.straight, position: pose.position });
      const ready = Boolean(lighting && pose.straight && pose.position);
      if (!landmarks) {
        this.holdReadyAt = 0;
        this.skinSamples = [];
        this.setCountdown('');
        this.setStatus(this.labels.moveFace);
      } else if (!ready) {
        this.holdReadyAt = 0;
        this.skinSamples = [];
        this.setCountdown('');
        this.setStatus(this.labels.holdChecks);
      } else {
        const now = performance.now();
        if (!this.holdReadyAt) this.holdReadyAt = now;
        const sample = skinFromLandmarks(pixels, landmarks);
        if (sample) {
          this.skinSamples.push(sample);
          if (this.skinSamples.length > SKIN_SAMPLE_MAX) this.skinSamples.shift();
        }
        const remainingMs = HOLD_CAPTURE_MS - (now - this.holdReadyAt);
        if (remainingMs > 0) {
          const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
          this.setCountdown(String(seconds));
          this.setStatus(`${this.labels.holdStill} ${seconds}`);
        } else {
          this.setCountdown('');
          this.setStatus(this.labels.holdStill);
          if (!this.captured) {
            this.captured = true;
            this.capture(landmarks);
          }
        }
      }
    } catch {
      this.holdReadyAt = 0;
      this.setCountdown('');
      if (!this.landmarkerReset) {
        this.landmarkerReset = true;
        resetVideoLandmarker();
      }
      this.setStatus(this.labels.manualPick);
    } finally {
      this.busy = false;
    }
  }

  private setCountdown(text: string) {
    const value = String(text || '').trim();
    this.countdown.textContent = value;
    this.countdown.hidden = !value;
  }

  private capture(landmarks: Landmark[]) {
    const rgb =
      averageSkinSamples(this.skinSamples) ||
      (this.lastPixels ? skinFromLandmarks(this.lastPixels, landmarks) : null);
    this.skinSamples = [];
    this.stopCamera();
    this.canvas.hidden = false;
    if (!rgb) {
      this.captured = false;
      this.setStatus(this.labels.manualPick);
      return;
    }
    this.skinLab = rgbToLab(rgb.r, rgb.g, rgb.b);
    this.tracker.track('scan_complete', {
      skinLab: this.skinLab.map((value) => Math.round(value * 100) / 100) as Lab,
      durationMs: Math.round(performance.now() - this.liveAt),
    });
    if (this.undertoneEnabled()) {
      this.undertone = null;
      this.showUndertoneStep();
      return;
    }
    this.recommend();
  }

  private paintGates(gates: FaceGates) {
    this.drawer.querySelectorAll<HTMLElement>('[data-fm-gate]').forEach((item) => {
      const passed = Boolean(gates[item.dataset.fmGate as keyof FaceGates]);
      item.classList.toggle('is-ok', passed);
      const state = item.querySelector('.fm-pdp__gate-state');
      if (state) state.textContent = passed ? 'True' : 'False';
    });
  }

  // ---------------------------------------------------------------- undertone

  private undertoneEnabled(): boolean {
    return Boolean(this.finder.settings.undertone.enabled);
  }

  private showUndertoneStep() {
    this.drawer.classList.add('is-ready', 'is-undertone');
    this.back.hidden = false;
    this.renderUndertone();
    this.setStatus('');
  }

  private renderUndertone() {
    this.results.replaceChildren();
    const config = this.finder.settings.undertone;
    this.results.appendChild(el('p', 'fm-pdp__undertone-title', config.title || 'What is your undertone?'));

    const row = el('div', 'fm-pdp__undertone-options');
    config.options.forEach((option) => {
      const card = button(`fm-pdp__undertone-card${this.undertone === option.id ? ' is-selected' : ''}`);
      card.style.background = option.background || '#d8d8d8';
      card.appendChild(el('span', 'fm-pdp__undertone-label', option.label || option.id));
      const description = String(option.description || '').trim();
      if (description) card.appendChild(el('span', 'fm-pdp__undertone-desc', description));
      card.addEventListener('click', () => {
        this.undertone = option.id;
        this.renderUndertone();
      });
      row.appendChild(card);
    });
    this.results.appendChild(row);

    const unsure = button('fm-pdp__undertone-unsure', config.unsureLabel || "I'M NOT SURE");
    unsure.addEventListener('click', () => {
      this.undertone = null;
      this.tracker.track('undertone_select', { undertone: null });
      this.recommend();
    });
    this.results.appendChild(unsure);

    const next = button('fm-pdp__undertone-next', config.nextLabel || 'NEXT');
    next.disabled = !this.undertone;
    next.addEventListener('click', () => {
      if (!this.undertone) return;
      this.tracker.track('undertone_select', { undertone: this.undertone });
      this.recommend();
    });
    this.results.appendChild(next);
  }

  // ---------------------------------------------------------------- results

  private recommend() {
    if (!this.skinLab) return;
    this.drawer.classList.remove('is-undertone');
    this.drawer.classList.add('is-ready');
    this.back.hidden = true;
    const preference = this.undertoneEnabled() ? this.undertone : null;
    this.matches = recommendShades(this.finder.variants, this.skinLab, preference, this.finder.settings.matching);
    const bestIndex = this.matches.findIndex((item) => item.role === 'best');
    this.selected = bestIndex >= 0 ? bestIndex : 0;
    this.tracker.track('result_shown', {
      undertone: preference ?? null,
      recommended: this.recommendedSlots(),
    });
    this.render();
    this.setStatus(this.matches.length ? this.labels.skinReady : this.labels.emptyColumn);
    this.scheduleFeedback();
  }

  private recommendedSlots() {
    return this.matches.map((item) => ({ variantId: item.variant.id, sku: item.variant.sku, role: item.role }));
  }

  private matchTitle(item: Match | undefined): string {
    if (item?.role === 'lighter') return this.labels.matchLighter;
    if (item?.role === 'deeper') return this.labels.matchDeeper;
    return this.labels.matchBest;
  }

  private render() {
    const items = this.matches;
    this.results.replaceChildren();
    const selected = items[this.selected] || items[0];
    this.results.appendChild(
      el('p', 'fm-pdp__sheet-title', items.length ? this.matchTitle(selected) : this.labels.emptyColumn)
    );

    if (items.length) {
      const row = el('div', 'fm-pdp__shades');
      items.forEach((item, index) => {
        const swatch = button(`fm-pdp__shade${index === this.selected ? ' is-selected' : ''}`, undefined, {
          'aria-label': item.variant.name,
        });
        swatch.style.background = item.hex;
        swatch.addEventListener('click', () => {
          this.selected = index;
          this.tracker.track('shade_select', { variantId: item.variant.id, sku: item.variant.sku, role: item.role });
          this.render();
        });
        row.appendChild(swatch);
      });
      this.results.appendChild(row);

      const item = selected;
      this.results.append(
        el('p', 'fm-pdp__product', this.finder.title),
        el('p', 'fm-pdp__shade-name', item.variant.name)
      );

      const links = resolveVariantLinks(this.finder.buttons, item.variant);
      if (links.length) {
        const group = el('div', 'fm-page__links');
        links.forEach((link) => {
          const anchor = el(
            'a',
            link.style === 'secondary' ? 'fm-pdp__bag fm-page__link--secondary' : 'fm-pdp__bag',
            link.label
          );
          anchor.href = link.url;
          anchor.target = '_blank';
          anchor.rel = 'noopener';
          anchor.addEventListener('click', () => {
            this.tracker.track('link_click', {
              variantId: item.variant.id,
              sku: item.variant.sku,
              role: item.role,
              buttonId: link.buttonId,
              url: link.url,
            });
            this.tracker.flush();
          });
          group.appendChild(anchor);
        });
        this.results.appendChild(group);
      }
    }

    const again = button('fm-pdp__scan', this.labels.scanAgain);
    again.addEventListener('click', () => {
      this.tracker.track('scan_again');
      this.clearFeedback(true);
      this.startCamera();
    });
    this.results.appendChild(again);
  }

  private setStatus(text: string) {
    this.status.textContent = text || '';
  }
}
