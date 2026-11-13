import { FINDER_BRANDS } from '@tryon/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export function BrandSelect({
  value,
  onChange,
  disabled,
  invalid,
  id,
}: {
  value: string;
  onChange: (brand: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className={cn('w-full', invalid && 'border-destructive')}>
        <SelectValue placeholder="选择品牌" />
      </SelectTrigger>
      <SelectContent>
        {FINDER_BRANDS.map((brand) => (
          <SelectItem key={brand} value={brand}>
            {brand}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
