import { FINDER_BRANDS } from '@tryon/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export function BrandSelect({
  value,
  onChange,
  disabled,
  invalid,
  id,
  brands,
}: {
  value: string;
  onChange: (brand: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  /** 空或不传表示全部品牌。 */
  brands?: readonly string[];
}) {
  const { t } = useI18n();
  const options = brands && brands.length > 0 ? FINDER_BRANDS.filter((brand) => brands.includes(brand)) : FINDER_BRANDS;
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={cn('w-full', invalid && 'border-destructive')}>
        <SelectValue placeholder={t('brand.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {options.map((brand) => (
          <SelectItem key={brand} value={brand}>
            {brand}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
