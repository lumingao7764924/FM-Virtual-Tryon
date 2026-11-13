import { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, Undo2 } from 'lucide-react';
import { apiFetch, errorMessage } from '@/api';
import { toast } from '@/components/toast';
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

export type QrTarget = { id: string; code: string; title: string; scanUrl: string; active: boolean };

interface PreviewPass {
  url: string;
  expiresAt: number;
  image: string;
}

function remainLabel(expiresAt: number, now: number): string {
  const left = Math.max(0, expiresAt - now);
  const minutes = Math.floor(left / 60000);
  const seconds = Math.floor((left % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function QrDialog({ target, onOpenChange }: { target: QrTarget | null; onOpenChange: (open: boolean) => void }) {
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

  useEffect(() => {
    if (!target) return;
    setPreset('none');
    setCustom('');
    setPass(null);
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
      toast({ title: '操作失败', description: errorMessage(err), variant: 'destructive' });
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
      toast({ title: '预览码生成失败', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setIssuing(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pass ? '预览二维码' : '二维码'} · {target?.title}</DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">{pass ? pass.url : url}</DialogDescription>
        </DialogHeader>

        {pass ? (
          <Alert>
            <AlertDescription>
              {expired
                ? '这张预览码已过期。正式二维码不受影响。'
                : `非正式预览，剩余 ${remainLabel(pass.expiresAt, now)}。未启用也能扫码采集，过期后失效。不会写入数据库。`}
            </AlertDescription>
          </Alert>
        ) : target && !target.active ? (
          <Alert>
            <AlertDescription>该项目当前已停用，正式二维码扫码会提示不可用。预览码可以在停用时试用 10 分钟。</AlertDescription>
          </Alert>
        ) : null}

        {pass ? null : (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label className="mb-0 leading-5">渠道</Label>
              <InfoHint title="渠道参数">
                同一个项目可以给不同渠道各印一张码（链接带 ?ch=渠道），数据页可以按渠道拆分。二维码内容不同，但都指向同一套配置。
              </InfoHint>
            </div>
            <div className="flex gap-2">
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_PRESETS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {preset === 'custom' ? (
                <Input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32))}
                  placeholder="如 walmart、event01"
                />
              ) : null}
            </div>
          </div>
        )}

        <div className="flex justify-center rounded-lg border bg-white p-3">
          {pass ? (
            <img src={pass.image} alt="预览二维码" className={expired ? 'size-60 opacity-30' : 'size-60'} />
          ) : preview ? (
            <img src={preview} alt="二维码" className="size-60" />
          ) : (
            <div className="size-60" />
          )}
        </div>

        {pass ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={expired} onClick={() => run(() => copyText(pass.url), '预览链接已复制')}>
              <Copy /> 复制链接
            </Button>
            <Button variant="outline" onClick={() => void issuePreview()} disabled={issuing}>
              <ExternalLink /> {expired ? '重新生成' : '换一张'}
            </Button>
            <Button variant="outline" className="col-span-2" onClick={() => setPass(null)}>
              <Undo2 /> 返回正式二维码
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => run(async () => downloadHref(await qrDataUrl(url, 1024), `${fileBase}.png`))}>
              <Download /> PNG
            </Button>
            <Button
              variant="outline"
              onClick={() => run(async () => downloadText(await qrSvg(url), `${fileBase}.svg`, 'image/svg+xml'))}
            >
              <Download /> SVG（印刷）
            </Button>
            <Button variant="outline" onClick={() => run(() => copyText(url), '链接已复制')}>
              <Copy /> 复制链接
            </Button>
            <Button variant="outline" onClick={() => void issuePreview()} disabled={issuing || !target}>
              <ExternalLink /> 打开预览
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
