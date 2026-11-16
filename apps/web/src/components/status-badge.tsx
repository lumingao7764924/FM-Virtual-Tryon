import type { FinderStatus } from '@tryon/shared';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export function StatusBadge({ status, className }: { status: FinderStatus; className?: string }) {
  const { t } = useI18n();
  return status === 'active' ? (
    <Badge className={cn('border-transparent bg-emerald-600 text-white', className)}>{t('status.active')}</Badge>
  ) : (
    <Badge variant="secondary" className={className}>
      {t('status.disabled')}
    </Badge>
  );
}
