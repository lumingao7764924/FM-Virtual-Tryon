import { hexToLab, normalizeHex, resolveVariantUndertone, type Undertone } from '@tryon/shared';
import { ColorField } from '@/components/color-field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Field, Section, type SectionProps } from './shared';
import { UNDERTONE_LABEL } from './variants-section';

export function UndertoneSection({ draft, update, readOnly }: SectionProps) {
  const settings = draft.settings.undertone;
  const counts: Record<Undertone, number> = { cool: 0, neutral: 0, warm: 0 };
  for (const variant of draft.variants) {
    const hex = normalizeHex(variant.hex);
    if (variant.enabled && hex) counts[resolveVariantUndertone(variant, hexToLab(hex))] += 1;
  }

  return (
    <div className="space-y-4">
      <Section
        title="冷 / 中 / 暖色调（Tone map）"
        description="开启后，扫脸结束会先让顾客选自己的色调，推荐时优先该色调的色号；选「不确定」则只按肤色深浅匹配。"
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="tone-enabled">{settings.enabled ? '已开启' : '已关闭'}</Label>
            <Switch
              id="tone-enabled"
              checked={settings.enabled}
              disabled={readOnly}
              onCheckedChange={(checked) => update((d) => void (d.settings.undertone.enabled = checked))}
            />
          </div>
        }
      >
        <div className="flex flex-wrap gap-2 text-sm">
          {(Object.keys(counts) as Undertone[]).map((tone) => (
            <span key={tone} className="rounded-md bg-muted px-2.5 py-1">
              {UNDERTONE_LABEL[tone]}调色号 <b>{counts[tone]}</b>
            </span>
          ))}
          <span className="self-center text-xs text-muted-foreground">每个色号的色调在「色号变体」里设置</span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="弹窗标题">
            <Input
              value={settings.title}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.undertone.title = e.target.value))}
            />
          </Field>
          <Field label="下一步按钮">
            <Input
              value={settings.nextLabel}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.undertone.nextLabel = e.target.value))}
            />
          </Field>
          <Field label="「不确定」按钮">
            <Input
              value={settings.unsureLabel}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.undertone.unsureLabel = e.target.value))}
            />
          </Field>
        </div>
      </Section>

      <Section title="色调选项" description="三个选项的文字、说明和色卡底色。">
        <div className="grid gap-4 lg:grid-cols-3">
          {settings.options.map((option, index) => (
            <div key={option.id} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{UNDERTONE_LABEL[option.id]}调</span>
                <span className="rounded-md px-3 py-1 text-xs font-semibold" style={{ background: option.background }}>
                  {option.label || '—'}
                </span>
              </div>
              <Field label="选项文字">
                <Input
                  value={option.label}
                  disabled={readOnly}
                  onChange={(e) => update((d) => void (d.settings.undertone.options[index].label = e.target.value))}
                />
              </Field>
              <Field label="说明（可空）">
                <Input
                  value={option.description}
                  disabled={readOnly}
                  onChange={(e) =>
                    update((d) => void (d.settings.undertone.options[index].description = e.target.value))
                  }
                />
              </Field>
              <Field label="底色">
                <ColorField
                  value={option.background}
                  disabled={readOnly}
                  onChange={(hex) => update((d) => void (d.settings.undertone.options[index].background = hex))}
                />
              </Field>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
