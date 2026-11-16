import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { MAX_BUTTONS, type FinderLinkButton } from '@tryon/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';
import { Field, Section, errorAt, type SectionProps } from './shared';

function nextButtonId(buttons: FinderLinkButton[]): string {
  const used = new Set(buttons.map((button) => button.id));
  for (let n = buttons.length + 1; ; n += 1) {
    const id = `link${n}`;
    if (!used.has(id)) return id;
  }
}

export function ButtonsSection({ draft, update, errors, readOnly }: SectionProps) {
  const { t } = useI18n();
  const buttons = draft.buttons;

  function move(index: number, delta: number) {
    update((d) => {
      const target = index + delta;
      if (target < 0 || target >= d.buttons.length) return;
      [d.buttons[index], d.buttons[target]] = [d.buttons[target], d.buttons[index]];
    });
  }

  function removeButton(index: number) {
    update((d) => {
      const [removed] = d.buttons.splice(index, 1);
      for (const variant of d.variants) delete variant.links[removed.id];
    });
  }

  return (
    <div className="space-y-3">
      <Section
        title={t('buttons.title', { count: buttons.length, max: MAX_BUTTONS })}
        description={t('buttons.desc')}
        actions={
          readOnly ? null : (
            <Button
              size="sm"
              disabled={buttons.length >= MAX_BUTTONS}
              onClick={() =>
                update((d) =>
                  void d.buttons.push({
                    id: nextButtonId(d.buttons),
                    label: 'SHOP NOW',
                    url: '',
                    style: d.buttons.length ? 'secondary' : 'primary',
                    enabled: true,
                  }),
                )
              }
            >
              <Plus /> {t('buttons.add')}
            </Button>
          )
        }
      >
        {errorAt(errors, 'buttons') ? <p className="text-sm text-destructive">{errorAt(errors, 'buttons')}</p> : null}
        <div className="space-y-3">
          {buttons.map((button, index) => {
            const path = `buttons.${index}`;
            return (
              <div key={button.id} className={cn('border p-2.5', !button.enabled && 'opacity-60')}>
                <div className="grid gap-3 md:grid-cols-[1fr_2fr_9rem]">
                  <Field label={t('buttons.label')} error={errorAt(errors, `${path}.label`)}>
                    <Input
                      value={button.label}
                      disabled={readOnly}
                      onChange={(e) => update((d) => void (d.buttons[index].label = e.target.value))}
                    />
                  </Field>
                  <Field
                    label={t('buttons.url')}
                    error={errorAt(errors, `${path}.url`)}
                    hint={t('buttons.urlHint')}
                  >
                    <Input
                      value={button.url}
                      placeholder="https://"
                      disabled={readOnly}
                      onChange={(e) => update((d) => void (d.buttons[index].url = e.target.value.trim()))}
                    />
                  </Field>
                  <Field label={t('buttons.style')}>
                    <Select
                      value={button.style}
                      disabled={readOnly}
                      onValueChange={(value) =>
                        update((d) => void (d.buttons[index].style = value as FinderLinkButton['style']))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">{t('buttons.primary')}</SelectItem>
                        <SelectItem value="secondary">{t('buttons.secondary')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={button.enabled}
                      disabled={readOnly}
                      onCheckedChange={(checked) => update((d) => void (d.buttons[index].enabled = checked))}
                      aria-label={t('buttons.enableAria')}
                    />
                    {button.enabled ? t('buttons.show') : t('buttons.hide')}
                    <span className="font-mono">ID: {button.id}</span>
                    {errorAt(errors, `${path}.id`) ? (
                      <span className="text-destructive">{errorAt(errors, `${path}.id`)}</span>
                    ) : null}
                  </div>
                  {readOnly ? null : (
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="size-7" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('buttons.up')}>
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index === buttons.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label={t('buttons.down')}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => removeButton(index)}
                        aria-label={t('buttons.delete')}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {buttons.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('buttons.empty')}</p>
          ) : null}
        </div>
      </Section>

      {buttons.length && draft.variants.length ? (
        <Section title={t('buttons.perShade')} description={t('buttons.perShadeDesc')}>
          <div className="overflow-x-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40">{t('buttons.shade')}</TableHead>
                  {buttons.map((button) => (
                    <TableHead key={button.id} className="min-w-56">
                      {button.label || button.id}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.variants.map((variant, vIndex) => (
                  <TableRow key={variant.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="size-4 shrink-0 rounded-full border" style={{ background: variant.hex }} />
                        <span className="truncate text-sm">{variant.name}</span>
                      </div>
                    </TableCell>
                    {buttons.map((button) => {
                      const error = errorAt(errors, `variants.${vIndex}.links.${button.id}`);
                      return (
                        <TableCell key={button.id}>
                          <Input
                            className={cn('text-xs', error && 'border-destructive')}
                            title={error}
                            value={variant.links[button.id] ?? ''}
                            placeholder={button.url || t('buttons.noDefault')}
                            disabled={readOnly}
                            onChange={(e) =>
                              update((d) => {
                                const value = e.target.value.trim();
                                if (value) d.variants[vIndex].links[button.id] = value;
                                else delete d.variants[vIndex].links[button.id];
                              })
                            }
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
