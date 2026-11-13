import type { ReactNode } from 'react';
import type { FieldError, Finder } from '@tryon/shared';
import { InfoHint } from '@/components/info-hint';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type UpdateDraft = (recipe: (draft: Finder) => void) => void;

export interface SectionProps {
  draft: Finder;
  update: UpdateDraft;
  errors: FieldError[];
  readOnly: boolean;
}

export function errorAt(errors: FieldError[], path: string): string | undefined {
  return errors.find((error) => error.path === path)?.message;
}

export function errorsUnder(errors: FieldError[], prefix: string): FieldError[] {
  return errors.filter((error) => error.path === prefix || error.path.startsWith(`${prefix}.`));
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('rounded-none shadow-none', className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 p-3">
        <div className="space-y-0.5">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className="space-y-3 p-3 pt-0">{children}</CardContent>
    </Card>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor} className="mb-0 leading-5">
          {label}
        </Label>
        {hint ? <InfoHint title={typeof label === 'string' ? label : '说明'}>{hint}</InfoHint> : null}
      </div>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
