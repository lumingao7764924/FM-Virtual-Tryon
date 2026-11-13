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
import { Field, Section, type SectionProps } from './shared';
import { UNDERTONE_LABEL } from './variants-section';

const ROLE_LABEL: Record<ShadeRole, string> = { lighter: '偏浅一档', best: '最佳匹配', deeper: '偏深一档' };
const SAMPLE_SKINS = ['#F1D3BE', '#E2B897', '#D6A47E', '#BC8763', '#8D5B3E'];

function depthLabel(step: number): string {
  if (step === 0) return '0（标准）';
  return step > 0 ? `+${step}（更偏浅）` : `${step}（更偏深）`;
}

export function MatchingSection({ draft, update, readOnly }: SectionProps) {
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

  return (
    <div className="space-y-4">
      <Section
        title="匹配阈值"
        description="和 Shopify 版一致：深浅档位整体调节推荐偏浅还是偏深；近似池控制「偏浅 / 偏深」候选的范围。"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            label="深浅档位"
            hint="-10 … +10，每档约 0.4 L。正数整体推荐更浅，负数更深。顾客普遍反馈「太深」就往正调。"
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
          <Field label="近似池大小（高级）" hint="取得分最好的前 N 个色号作为候选，默认 7。色号很多时可适当调大。">
            <Input
              type="number"
              min={3}
              max={20}
              value={matching.nearPoolSize}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.matching.nearPoolSize = Number(e.target.value)))}
            />
          </Field>
          <Field label="最大额外色差（高级）" hint="候选与最佳的色差（ΔE）超过这个值就不推荐，默认 10。越小越严格。">
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

      <Section title="试算" description="输入一个肤色，按当前设置（未保存也生效）看看会推荐哪三个色号。">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="肤色">
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
                aria-label={`示例肤色 ${hex}`}
              />
            ))}
          </div>
          <Field label="顾客选的色调">
            <Select value={preference} onValueChange={(value) => setPreference(value as typeof preference)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不确定 / 未开启</SelectItem>
                {(['cool', 'neutral', 'warm'] as const).map((tone) => (
                  <SelectItem key={tone} value={tone}>
                    {UNDERTONE_LABEL[tone]}调
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
                <div key={role} className="flex items-center gap-3 rounded-lg border p-3">
                  <div
                    className="size-10 shrink-0 rounded-full border"
                    style={{ background: hit?.hex ?? 'transparent' }}
                  />
                  <div className="min-w-0 text-sm">
                    <p className="text-xs text-muted-foreground">{ROLE_LABEL[role]}</p>
                    {hit ? (
                      <>
                        <p className="truncate font-medium">{hit.variant.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {UNDERTONE_LABEL[hit.undertone]} · ΔE {hit.de.toFixed(1)}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">无合适色号</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">先添加并启用色号。</p>
        )}
      </Section>
    </div>
  );
}
