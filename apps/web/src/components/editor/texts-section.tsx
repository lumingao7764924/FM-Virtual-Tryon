import type { FinderSettings } from '@tryon/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useI18n, type MessageKey } from '@/i18n';
import { Field, Section, type SectionProps } from './shared';

type LabelKey = keyof FinderSettings['labels'];

const LABEL_GROUPS: { title: MessageKey; items: [LabelKey, MessageKey][] }[] = [
  {
    title: 'texts.group.camera',
    items: [
      ['detecting', 'texts.label.detecting'],
      ['cameraDenied', 'texts.label.cameraDenied'],
      ['moveFace', 'texts.label.moveFace'],
      ['holdChecks', 'texts.label.holdChecks'],
      ['holdStill', 'texts.label.holdStill'],
      ['holdHint', 'texts.label.holdHint'],
      ['manualPick', 'texts.label.manualPick'],
      ['skinReady', 'texts.label.skinReady'],
    ],
  },
  {
    title: 'texts.group.gates',
    items: [
      ['gateLighting', 'texts.label.gateLighting'],
      ['gateStraight', 'texts.label.gateStraight'],
      ['gatePosition', 'texts.label.gatePosition'],
    ],
  },
  {
    title: 'texts.group.result',
    items: [
      ['matchLighter', 'texts.label.matchLighter'],
      ['matchBest', 'texts.label.matchBest'],
      ['matchDeeper', 'texts.label.matchDeeper'],
      ['emptyColumn', 'texts.label.emptyColumn'],
      ['scanAgain', 'texts.label.scanAgain'],
    ],
  },
];

export function TextsSection({ draft, update, readOnly }: SectionProps) {
  const { t } = useI18n();
  const { feedback, privacy, labels } = draft.settings;

  return (
    <div className="space-y-3">
      <Section
        title={t('texts.feedback')}
        description={t('texts.feedbackDesc')}
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="fb-enabled" className="mb-0">
              {feedback.enabled ? t('undertone.on') : t('undertone.off')}
            </Label>
            <Switch
              id="fb-enabled"
              checked={feedback.enabled}
              disabled={readOnly}
              onCheckedChange={(checked) => update((d) => void (d.settings.feedback.enabled = checked))}
            />
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t('texts.delay')}>
            <Input
              type="number"
              min={0}
              max={60}
              value={feedback.delaySeconds}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.feedback.delaySeconds = Number(e.target.value)))}
            />
          </Field>
          <Field label={t('texts.title')} className="md:col-span-2">
            <Input
              value={feedback.title}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.feedback.title = e.target.value))}
            />
          </Field>
          <Field label={t('texts.lighter')}>
            <Input
              value={feedback.lighterLabel}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.feedback.lighterLabel = e.target.value))}
            />
          </Field>
          <Field label={t('texts.right')}>
            <Input
              value={feedback.justRightLabel}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.feedback.justRightLabel = e.target.value))}
            />
          </Field>
          <Field label={t('texts.deeper')}>
            <Input
              value={feedback.deeperLabel}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.feedback.deeperLabel = e.target.value))}
            />
          </Field>
        </div>
      </Section>

      <Section title={t('texts.privacy')} description={t('texts.privacyDesc')}>
        <Field label={t('texts.privacyBody')}>
          <Textarea
            rows={3}
            value={privacy.note}
            disabled={readOnly}
            placeholder="We only analyze your skin tone on this device. No photos are uploaded or stored."
            onChange={(e) => update((d) => void (d.settings.privacy.note = e.target.value))}
          />
        </Field>
        <Field label={t('texts.confirm')} className="md:w-1/3">
          <Input
            value={privacy.confirmLabel}
            disabled={readOnly}
            onChange={(e) => update((d) => void (d.settings.privacy.confirmLabel = e.target.value))}
          />
        </Field>
      </Section>

      <Section title={t('texts.labels')} description={t('texts.labelsDesc')}>
        {LABEL_GROUPS.map((group) => (
          <div key={group.title} className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{t(group.title)}</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map(([key, name]) => (
                <Field key={key} label={t(name)}>
                  <Input
                    value={labels[key]}
                    disabled={readOnly}
                    onChange={(e) => update((d) => void (d.settings.labels[key] = e.target.value))}
                  />
                </Field>
              ))}
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}
