import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export const PAGE_SIZE_OPTIONS = [20, 50, 100];

export function ListPager({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
}) {
  const { t } = useI18n();
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground', className)}>
      <div className="flex items-center gap-2">
        <span>{t('pager.perPage')}</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger size="sm" className="w-[4.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>{t('pager.summary', { total, page: current, pages })}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" disabled={current <= 1} onClick={() => onPageChange(current - 1)}>
          <ChevronLeft />
          {t('pager.prev')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={current >= pages} onClick={() => onPageChange(current + 1)}>
          {t('pager.next')}
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
