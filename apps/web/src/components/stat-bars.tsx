import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatNumber, formatPercent } from '@/lib/format';

export function KpiCard({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/** 横向条形列表：label + 数值 + 占比条 */
export function BarList({
  rows,
  total,
  empty = '暂无数据',
  barClassName,
}: {
  rows: { key: string; label: ReactNode; value: number; extra?: ReactNode }[];
  total?: number;
  empty?: string;
  barClassName?: string;
}) {
  if (!rows.length) return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((row) => row.value), 1);
  const sum = total ?? rows.reduce((acc, row) => acc + row.value, 0);
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatNumber(row.value)} · {formatPercent(row.value, sum)}
              {row.extra}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className={cn('h-2 rounded-full bg-primary/80', barClassName)}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export const FEEDBACK_COLORS = {
  too_light: 'bg-sky-400',
  just_right: 'bg-emerald-500',
  too_deep: 'bg-amber-500',
} as const;

/** 偏浅 / 刚好 / 偏深 三段堆叠条 */
export function FeedbackBar({
  counts,
  className,
}: {
  counts: Record<keyof typeof FEEDBACK_COLORS, number>;
  className?: string;
}) {
  const total = counts.too_light + counts.just_right + counts.too_deep;
  if (!total) return <div className={cn('h-2 rounded-full bg-muted', className)} />;
  return (
    <div
      className={cn('flex h-2 overflow-hidden rounded-full bg-muted', className)}
      title={`偏浅 ${counts.too_light} / 刚好 ${counts.just_right} / 偏深 ${counts.too_deep}`}
    >
      {(Object.keys(FEEDBACK_COLORS) as (keyof typeof FEEDBACK_COLORS)[]).map((key) =>
        counts[key] ? (
          <div key={key} className={FEEDBACK_COLORS[key]} style={{ width: `${(counts[key] / total) * 100}%` }} />
        ) : null,
      )}
    </div>
  );
}
