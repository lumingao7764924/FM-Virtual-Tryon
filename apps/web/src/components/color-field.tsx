import { useEffect, useState } from 'react';
import { normalizeHex } from '@tryon/shared';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/** 色块（点开系统取色器）+ HEX 输入；失焦时规范成 #RRGGBB，非法值回退 */
export function ColorField({
  value,
  onChange,
  className,
  invalid,
  disabled,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
  invalid?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const normalized = normalizeHex(value);

  function commit(raw: string) {
    const hex = normalizeHex(raw);
    if (hex) onChange(hex);
    else setDraft(value);
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label
        className={cn(
          'relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border',
          disabled && 'pointer-events-none opacity-50',
        )}
        style={{ background: normalized ?? 'transparent' }}
        title={t('color.pick')}
      >
        <input
          type="color"
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          value={normalized ?? '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          disabled={disabled}
          aria-label={ariaLabel ? `${ariaLabel} ${t('color.picker')}` : t('color.picker')}
        />
      </label>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
        className={cn('w-24 font-mono text-xs uppercase', invalid && 'border-destructive')}
        placeholder="#RRGGBB"
        disabled={disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}
