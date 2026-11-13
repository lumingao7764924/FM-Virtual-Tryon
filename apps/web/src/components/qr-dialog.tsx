import { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink } from 'lucide-react';
import { errorMessage } from '@/api';
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

export type QrTarget = { code: string; title: string; scanUrl: string; active: boolean };

export function QrDialog({ target, onOpenChange }: { target: QrTarget | null; onOpenChange: (open: boolean) => void }) {
  const [preset, setPreset] = useState<string>('none');
  const [custom, setCustom] = useState('');
  const [preview, setPreview] = useState('');

  const channel = preset === 'custom' ? custom.trim() : preset === 'none' ? '' : preset;
  const url = target ? withChannel(target.scanUrl, channel) : '';
  const fileBase = target ? `qr-${target.code}${channel ? `-${channel}` : ''}` : 'qr';

  useEffect(() => {
    if (!target) return;
    setPreset('none');
    setCustom('');
  }, [target]);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    qrDataUrl(url, 480)
      .then((data) => !cancelled && setPreview(data))
      .catch(() => !cancelled && setPreview(''));
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function run(action: () => Promise<void>, success?: string) {
    try {
      await action();
      if (success) toast({ title: success, variant: 'success' });
    } catch (err) {
      toast({ title: '操作失败', description: errorMessage(err), variant: 'destructive' });
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>二维码 · {target?.title}</DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">{url}</DialogDescription>
        </DialogHeader>

        {target && !target.active ? (
          <Alert>
            <AlertDescription>该项目当前已停用，扫码会提示不可用。启用后同一个二维码即可使用。</AlertDescription>
          </Alert>
        ) : null}

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

        <div className="flex justify-center rounded-lg border bg-white p-3">
          {preview ? <img src={preview} alt="二维码" className="size-60" /> : <div className="size-60" />}
        </div>

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
          <Button variant="outline" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink /> 打开预览
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
