import { useMemo, useState } from 'react';
import {
  DEPTH_STEP_MAX,
  DEPTH_STEP_MIN,
  hexToLab,
  normalizeHex,
  recommendShades,
  type ShadeRole,
  type Undertone,
} from '@tryon/shared';
import { ColorField } from '@/components/color-field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n, type MessageKey } from '@/i18n';
import { Field, Section, type SectionProps } from './shared';
import { TONE_KEY } from './variants-section';

const ROLE_KEY: Record<ShadeRole, MessageKey> = { lighter: 'match.lighter', best: 'match.best', deeper: 'match.deeper' };
const SAMPLE_SKINS = ['#F1D3BE', '#E2B897', '#D6A47E', '#BC8763', '#8D5B3E'];

export function MatchingSection({ draft, update, readOnly }: SectionProps) {
  const { t } = useI18n();
  const matching = draft.settings.matching;
  const [skin, setSkin] = useState(SAMPLE_SKINS[1]);
  const [preference, setPreference] = useState<'none' | Undertone>('none');

  const results = useMemo(() => {
    const hex = normalizeHex(skin);
    const catalog = draft.variants.filter((variant) => variant.enabled && normalizeHex(variant.hex));
    if (!hex || !catalog.length) return [];
    return recommendShades(catalog, hexToLab(hex), preference === 'none' ? null : preference, matching);
  }, [skin, preference, draft.variants, matching]);

  const steps = Array.from({ length: DEPTH_STEP_MAX - DEPTH_STEP_MIN + 1 }, (_, i) => DEPTH_STEP_MAX - i);
  const depthLabel = (step: number) => {
    if (step === 0) return t('match.depthZero');
    return step > 0 ? t('match.depthLight', { step }) : t('match.depthDeep', { step });
  };

  return (
    <div className="space-y-3">
      <Section
        title={t('match.title')}
        description={t('match.desc')}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            label={t('match.depth')}
            hint={t('match.depthHint')}
          >
            <Select
              value={String(matching.depthStep)}
              disabled={readOnly}
              onValueChange={(value) => update((d) => void (d.settings.matching.depthStep = Number(value)))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {steps.map((step) => (
                  <SelectItem key={step} value={String(step)}>
                    {depthLabel(step)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t('match.pool')} hint={t('match.poolHint')}>
            <Input
              type="number"
              min={3}
              max={20}
              value={matching.nearPoolSize}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.matching.nearPoolSize = Number(e.target.value)))}
            />
          </Field>
          <Field label={t('match.delta')} hint={t('match.deltaHint')}>
            <Input
              type="number"
              min={1}
              max={40}
              step={0.5}
              value={matching.nearMaxExtraDe}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.matching.nearMaxExtraDe = Number(e.target.value)))}
            />
          </Field>
        </div>
      </Section>

      <Section title={t('match.try')} description={t('match.tryDesc')}>
        <div className="flex flex-wrap items-end gap-4">
          <Field label={t('match.skin')}>
            <ColorField value={skin} onChange={setSkin} />
          </Field>
          <div className="flex gap-1.5 pb-1">
            {SAMPLE_SKINS.map((hex) => (
              <button
                key={hex}
                type="button"
                className="size-7 rounded-full border"
                style={{ background: hex }}
                onClick={() => setSkin(hex)}
                aria-label={t('match.skinAria', { hex })}
              />
            ))}
          </div>
          <Field label={t('match.pref')}>
            <Select value={preference} onValueChange={(value) => setPreference(value as typeof preference)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('match.unsure')}</SelectItem>
                {(['cool', 'neutral', 'warm'] as const).map((tone) => (
                  <SelectItem key={tone} value={tone}>
                    {t('undertone.option', { name: t(TONE_KEY[tone]) })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {results.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {(['lighter', 'best', 'deeper'] as const).map((role) => {
              const hit = results.find((item) => item.role === role);
              return (
                <div key={role} className="flex items-center gap-3 border p-2.5">
                  <div
                    className="size-10 shrink-0 rounded-full border"
                    style={{ background: hit?.hex ?? 'transparent' }}
                  />
                  <div className="min-w-0 text-sm">
                    <p className="text-xs text-muted-foreground">{t(ROLE_KEY[role])}</p>
                    {hit ? (
                      <>
                        <p className="truncate font-medium">{hit.variant.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {t(TONE_KEY[hit.undertone])} · ΔE {hit.de.toFixed(1)}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">{t('match.none')}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('match.needShades')}</p>
        )}
      </Section>
    </div>
  );
}
