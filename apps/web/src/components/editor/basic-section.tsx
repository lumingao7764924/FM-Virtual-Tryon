import { BrandSelect } from '@/components/brand-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, Section, errorAt, type SectionProps } from './shared';

export function BasicSection({ draft, update, errors, readOnly, scanUrl }: SectionProps & { scanUrl: string }) {
  return (
    <Section title="基本信息" description="名称和品牌用于后台识别，页面标题用产品名称。不显示价格。">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="产品名称" htmlFor="f-title" error={errorAt(errors, 'title')}>
          <Input
            id="f-title"
            value={draft.title}
            disabled={readOnly}
            onChange={(e) => update((d) => void (d.title = e.target.value))}
          />
        </Field>
        <Field label="品牌" htmlFor="f-brand" error={errorAt(errors, 'brand')}>
          <BrandSelect
            id="f-brand"
            value={draft.brand}
            disabled={readOnly}
            invalid={Boolean(errorAt(errors, 'brand'))}
            onChange={(brand) => update((d) => void (d.brand = brand))}
          />
        </Field>
        <Field
          label="扫码链接"
          className="md:col-span-2"
          hint="创建时自动生成、全局唯一，之后不会改变，所以已经印出去的二维码一直有效。"
        >
          <Input value={scanUrl} readOnly className="font-mono text-xs" />
        </Field>
      </div>
      <Field label="内部备注" htmlFor="f-notes" hint="只在后台可见，例如对应的 Amazon ASIN、包装批次等。">
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
