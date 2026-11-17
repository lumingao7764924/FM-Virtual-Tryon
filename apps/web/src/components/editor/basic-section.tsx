import { FINDER_BRANDS, type FinderBrand } from '@tryon/shared';
import { useAuth } from '@/hooks/use-auth';
import { BrandSelect } from '@/components/brand-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/i18n';
import { Field, Section, errorAt, type SectionProps } from './shared';

export function BasicSection({ draft, update, errors, readOnly, scanUrl }: SectionProps & { scanUrl: string }) {
  const { session } = useAuth();
  const { t } = useI18n();
  const scoped = session?.brands ?? [];
  const current = FINDER_BRANDS.find((brand) => brand === draft.brand);
  const brandOptions: readonly FinderBrand[] =
    scoped.length === 0 || !current || scoped.includes(current) ? scoped : [...scoped, current];
  return (
    <Section title={t('editor.tab.basic')} description={t('basic.desc')}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t('basic.name')} htmlFor="f-title" error={errorAt(errors, 'title')}>
          <Input
            id="f-title"
            value={draft.title}
            disabled={readOnly}
            onChange={(e) => update((d) => void (d.title = e.target.value))}
          />
        </Field>
        <Field label={t('basic.brand')} htmlFor="f-brand" error={errorAt(errors, 'brand')}>
          <BrandSelect
            id="f-brand"
            value={draft.brand}
            disabled={readOnly}
            brands={brandOptions}
            invalid={Boolean(errorAt(errors, 'brand'))}
            onChange={(brand) => update((d) => void (d.brand = brand))}
          />
        </Field>
        <Field
          label={t('basic.link')}
          className="md:col-span-2"
          hint={t('basic.linkHint')}
        >
          <Input value={scanUrl} readOnly className="font-mono text-xs" />
        </Field>
      </div>
      <Field label={t('basic.notes')} htmlFor="f-notes" hint={t('basic.notesHint')}>
        <Textarea
          id="f-notes"
          rows={3}
          value={draft.notes}
          disabled={readOnly}
          onChange={(e) => update((d) => void (d.notes = e.target.value))}
        />
      </Field>
    </Section>
  );
}
