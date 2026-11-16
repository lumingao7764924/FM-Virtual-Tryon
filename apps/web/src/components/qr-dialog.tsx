import { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, Undo2 } from 'lucide-react';
import { apiFetch, errorMessage } from '@/api';
import { toast } from '@/components/toast';
import { useI18n, type MessageKey } from '@/i18n';
import { InfoHint } from '@/components/info-hint';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CHANNEL_PRESETS,
  copyText,
  downloadHref,
  downloadText,
  qrDataUrl,
  qrSvg,
  withChannel,
} from '@/lib/finders';

export type QrTarget = { id: string; code: string; title: string; scanUrl: string; active: boolean; preview?: boolean };

interface PreviewPass {
  url: string;
  expiresAt: number;
  image: string;
}

const CHANNEL_KEY: Record<(typeof CHANNEL_PRESETS)[number]['value'], MessageKey> = {
  none: 'qr.channel.none',
  amazon: 'qr.channel.amazon',
  tiktok: 'qr.channel.tiktok',
  offline: 'qr.channel.offline',
  custom: 'qr.channel.custom',
};

function remainLabel(expiresAt: number, now: number): string {
  const left = Math.max(0, expiresAt - now);
  const minutes = Math.floor(left / 60000);
  const seconds = Math.floor((left % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function QrDialog({ target, onOpenChange }: { target: QrTarget | null; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n();
  const [preset, setPreset] = useState<string>('none');
  const [custom, setCustom] = useState('');
  const [preview, setPreview] = useState('');
  const [pass, setPass] = useState<PreviewPass | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const channel = preset === 'custom' ? custom.trim() : preset === 'none' ? '' : preset;
  const url = target ? withChannel(target.scanUrl, channel) : '';
  const fileBase = target ? `qr-${target.code}${channel ? `-${channel}` : ''}` : 'qr';
  const expired = pass !== null && pass.expiresAt <= now;
  const previewMode = pass !== null || (Boolean(target?.preview) && issuing);

  useEffect(() => {
    if (!target) return;
    setPreset('none');
    setCustom('');
    setPass(null);
    if (!target.preview) return;
    let cancelled = false;
    setIssuing(true);
    void (async () => {
      try {
        const issued = await apiFetch<{ url: string; expiresAt: string }>(`/api/finders/${target.id}/preview`, {
          method: 'POST',
        });
        const image = await qrDataUrl(issued.url, 480);
        if (!cancelled) {
          setPass({ url: issued.url, expiresAt: Date.parse(issued.expiresAt), image });
          setNow(Date.now());
        }
      } catch (err) {
        if (!cancelled) toast({ title: t('qr.issueFail'), description: errorMessage(err), variant: 'destructive' });
      } finally {
        if (!cancelled) setIssuing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    if (!url || pass) return;
    let cancelled = false;
    qrDataUrl(url, 480)
      .then((data) => !cancelled && setPreview(data))
      .catch(() => !cancelled && setPreview(''));
    return () => {
      cancelled = true;
    };
  }, [url, pass]);

  useEffect(() => {
    if (!pass || expired) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pass, expired]);

  async function run(action: () => Promise<void>, success?: string) {
    try {
      await action();
      if (success) toast({ title: success, variant: 'success' });
    } catch (err) {
      toast({ title: t('qr.actionFail'), description: errorMessage(err), variant: 'destructive' });
    }
  }

  async function issuePreview() {
    if (!target) return;
    setIssuing(true);
    try {
      const issued = await apiFetch<{ url: string; expiresAt: string }>(`/api/finders/${target.id}/preview`, {
        method: 'POST',
      });
      const image = await qrDataUrl(issued.url, 480);
      setPass({ url: issued.url, expiresAt: Date.parse(issued.expiresAt), image });
      setNow(Date.now());
    } catch (err) {
      toast({ title: t('qr.issueFail'), description: errorMessage(err), variant: 'destructive' });
    } finally {
      setIssuing(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{previewMode ? t('qr.previewTitle') : t('qr.title')} · {target?.title}</DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">{pass ? pass.url : previewMode ? t('qr.issuing') : url}</DialogDescription>
        </DialogHeader>

        {pass ? (
          <Alert>
            <AlertDescription>
              {expired
                ? t('qr.expired')
                : t('qr.previewBody', { time: remainLabel(pass.expiresAt, now) })}
            </AlertDescription>
          </Alert>
        ) : previewMode ? null : target && !target.active ? (
          <Alert>
            <AlertDescription>{t('qr.disabled')}</AlertDescription>
          </Alert>
        ) : null}

        {previewMode ? null : (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label className="mb-0 leading-5">{t('qr.channel')}</Label>
              <InfoHint title={t('qr.channelHintTitle')}>{t('qr.channelHint')}</InfoHint>
            </div>
            <div className="flex gap-2">
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_PRESETS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {t(CHANNEL_KEY[item.value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {preset === 'custom' ? (
                <Input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32))}
                  placeholder={t('qr.customPlaceholder')}
                />
              ) : null}
            </div>
          </div>
        )}

        <div className="flex justify-center rounded-lg border bg-white p-3">
          {pass ? (
            <img src={pass.image} alt={t('qr.altPreview')} className={expired ? 'size-60 opacity-30' : 'size-60'} />
          ) : preview && !previewMode ? (
            <img src={preview} alt={t('qr.alt')} className="size-60" />
          ) : (
            <div className="size-60" />
          )}
        </div>

        {pass ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={expired} onClick={() => run(() => copyText(pass.url), t('qr.copiedPreview'))}>
              <Copy /> {t('qr.copy')}
            </Button>
            <Button variant="outline" onClick={() => void issuePreview()} disabled={issuing}>
              <ExternalLink /> {expired ? t('qr.regenerate') : t('qr.refresh')}
            </Button>
            <Button variant="outline" className="col-span-2" onClick={() => setPass(null)}>
              <Undo2 /> {t('qr.back')}
            </Button>
          </div>
        ) : previewMode ? null : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => run(async () => downloadHref(await qrDataUrl(url, 1024), `${fileBase}.png`))}>
              <Download /> PNG
            </Button>
            <Button
              variant="outline"
              onClick={() => run(async () => downloadText(await qrSvg(url), `${fileBase}.svg`, 'image/svg+xml'))}
            >
              <Download /> {t('qr.svg')}
            </Button>
            <Button variant="outline" onClick={() => run(() => copyText(url), t('qr.copied'))}>
              <Copy /> {t('qr.copy')}
            </Button>
            <Button variant="outline" onClick={() => void issuePreview()} disabled={issuing || !target}>
              <ExternalLink /> {t('qr.openPreview')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
