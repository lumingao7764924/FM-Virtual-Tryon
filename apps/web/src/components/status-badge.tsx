import type { FinderStatus } from '@tryon/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function StatusBadge({ status, className }: { status: FinderStatus; className?: string }) {
  return status === 'active' ? (
    <Badge className={cn('border-transparent bg-emerald-600 text-white', className)}>启用中</Badge>
  ) : (
    <Badge variant="secondary" className={className}>
      已停用
    </Badge>
  );
}
