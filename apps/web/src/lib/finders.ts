import QRCode from 'qrcode';
import type { Finder } from '@tryon/shared';

export interface FinderDetail {
  finder: Finder;
  scanUrl: string;
}

/** 渠道参数，扫码页埋点用 `?ch=` 区分来源 */
export const CHANNEL_PRESETS = [
  { value: 'none', label: '不区分渠道' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'offline', label: '线下 / 包装' },
  { value: 'custom', label: '自定义…' },
] as const;

export function withChannel(scanUrl: string, channel: string): string {
  const ch = channel.trim();
  if (!ch) return scanUrl;
  const url = new URL(scanUrl);
  url.searchParams.set('ch', ch);
  return url.toString();
}

const QR_OPTIONS = { errorCorrectionLevel: 'M' as const, margin: 2 };

export function qrDataUrl(text: string, width = 1024): Promise<string> {
  return QRCode.toDataURL(text, { ...QR_OPTIONS, width });
}

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...QR_OPTIONS, type: 'svg' });
}

export function downloadHref(href: string, filename: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  downloadHref(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

export function newLocalId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
