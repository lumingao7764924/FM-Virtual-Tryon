import { hexToLab, normalizeHex, resolveVariantUndertone, type Undertone } from '@tryon/shared';
import { ColorField } from '@/components/color-field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/i18n';
import { Field, Section, type SectionProps } from './shared';
import { TONE_KEY } from './variants-section';

export function UndertoneSection({ draft, update, readOnly }: SectionProps) {
  const { t } = useI18n();
  const settings = draft.settings.undertone;
  const counts: Record<Undertone, number> = { cool: 0, neutral: 0, warm: 0 };
  for (const variant of draft.variants) {
    const hex = normalizeHex(variant.hex);
    if (variant.enabled && hex) counts[resolveVariantUndertone(variant, hexToLab(hex))] += 1;
  }

  return (
    <div className="space-y-3">
      <Section
        title={t('undertone.title')}
        description={t('undertone.desc')}
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="tone-enabled" className="mb-0">
              {settings.enabled ? t('undertone.on') : t('undertone.off')}
            </Label>
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
              {t('undertone.count', { name: t(TONE_KEY[tone]) })} <b>{counts[tone]}</b>
            </span>
          ))}
          <span className="self-center text-xs text-muted-foreground">{t('undertone.note')}</span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t('undertone.popup')}>
            <Input
              value={settings.title}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.undertone.title = e.target.value))}
            />
          </Field>
          <Field label={t('undertone.next')}>
            <Input
              value={settings.nextLabel}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.undertone.nextLabel = e.target.value))}
            />
          </Field>
          <Field label={t('undertone.unsure')}>
            <Input
              value={settings.unsureLabel}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.undertone.unsureLabel = e.target.value))}
            />
          </Field>
        </div>
      </Section>

      <Section title={t('undertone.options')} description={t('undertone.optionsDesc')}>
        <div className="grid gap-3 lg:grid-cols-3">
          {settings.options.map((option, index) => (
            <div key={option.id} className="space-y-3 border p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('undertone.option', { name: t(TONE_KEY[option.id]) })}</span>
                <span className="rounded-md px-3 py-1 text-xs font-semibold" style={{ background: option.background }}>
                  {option.label || '—'}
                </span>
              </div>
              <Field label={t('undertone.optionText')}>
                <Input
                  value={option.label}
                  disabled={readOnly}
                  onChange={(e) => update((d) => void (d.settings.undertone.options[index].label = e.target.value))}
                />
              </Field>
              <Field label={t('undertone.optionHint')}>
                <Input
                  value={option.description}
                  disabled={readOnly}
                  onChange={(e) =>
                    update((d) => void (d.settings.undertone.options[index].description = e.target.value))
                  }
                />
              </Field>
              <Field label={t('undertone.swatch')}>
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
