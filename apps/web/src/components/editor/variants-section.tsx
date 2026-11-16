import { useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import {
  MAX_VARIANTS,
  hexToLab,
  normalizeHex,
  resolveVariantUndertone,
  type FinderVariant,
  type Undertone,
  type UndertoneSetting,
} from '@tryon/shared';
import { ColorField } from '@/components/color-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useI18n, type MessageKey } from '@/i18n';
import { newLocalId } from '@/lib/finders';
import { cn } from '@/lib/utils';
import { Section, errorAt, type SectionProps } from './shared';

export const TONE_KEY: Record<Undertone, MessageKey> = { cool: 'tone.cool', neutral: 'tone.neutral', warm: 'tone.warm' };

function autoTone(hex: string): Undertone | null {
  const normalized = normalizeHex(hex);
  return normalized ? resolveVariantUndertone({ id: '', hex: normalized }, hexToLab(normalized)) : null;
}

function blankVariant(): FinderVariant {
  return {
    id: newLocalId('v'),
    name: '',
    sku: '',
    hex: '',
    undertone: 'auto',
    enabled: true,
    links: {},
  };
}

const TONE_ALIASES: Record<string, UndertoneSetting> = {
  cool: 'cool',
  c: 'cool',
  冷: 'cool',
  冷调: 'cool',
  neutral: 'neutral',
  n: 'neutral',
  中: 'neutral',
  中性: 'neutral',
  warm: 'warm',
  w: 'warm',
  暖: 'warm',
  暖调: 'warm',
  auto: 'auto',
  自动: 'auto',
};

interface ParsedPaste {
  variants: FinderVariant[];
  problems: number[];
}

function parsePaste(text: string): ParsedPaste {
  const variants: FinderVariant[] = [];
  const problems: number[] = [];
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const cells = line.split(/\t|,|，/).map((cell) => cell.trim());
      const [name, sku, hexRaw, toneRaw] = cells;
      const hex = normalizeHex(hexRaw);
      if (!name || !hex) {
        problems.push(index + 1);
        return;
      }
      variants.push({
        id: newLocalId('v'),
        name,
        sku: sku ?? '',
        hex,
        undertone: TONE_ALIASES[(toneRaw ?? '').toLowerCase()] ?? 'auto',
        enabled: true,
        links: {},
      });
    });
  return { variants, problems };
}

export function VariantsSection({ draft, update, errors, readOnly }: SectionProps) {
  const { t } = useI18n();
  const [pasteOpen, setPasteOpen] = useState(false);
  const variants = draft.variants;

  function move(index: number, delta: number) {
    update((d) => {
      const target = index + delta;
      if (target < 0 || target >= d.variants.length) return;
      [d.variants[index], d.variants[target]] = [d.variants[target], d.variants[index]];
    });
  }

  return (
    <Section
      title={t('variants.title', { count: variants.length })}
      description={t('variants.desc')}
      actions={
        readOnly ? null : (
          <>
            <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste /> {t('variants.paste')}
            </Button>
            <Button
              size="sm"
              disabled={variants.length >= MAX_VARIANTS}
              onClick={() => update((d) => void d.variants.push(blankVariant()))}
            >
              <Plus /> {t('variants.add')}
            </Button>
          </>
        )
      }
    >
      {errorAt(errors, 'variants') ? <p className="text-sm text-destructive">{errorAt(errors, 'variants')}</p> : null}
      <div className="overflow-x-auto border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="min-w-44">{t('variants.hex')}</TableHead>
              <TableHead className="min-w-40">{t('variants.name')}</TableHead>
              <TableHead className="min-w-32">SKU</TableHead>
              <TableHead className="min-w-36">{t('variants.tone')}</TableHead>
              <TableHead className="w-16">{t('variants.enabled')}</TableHead>
              {readOnly ? null : <TableHead className="w-28 text-right">{t('variants.order')}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant, index) => {
              const auto = autoTone(variant.hex);
              const path = `variants.${index}`;
              return (
                <TableRow key={variant.id} className={cn(!variant.enabled && 'opacity-60')}>
                  <TableCell className="text-xs text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <ColorField
                      value={variant.hex}
                      disabled={readOnly}
                      invalid={Boolean(errorAt(errors, `${path}.hex`))}
                      aria-label={t('variants.hexAria', { row: index + 1 })}
                      onChange={(hex) => update((d) => void (d.variants[index].hex = hex))}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className={cn(errorAt(errors, `${path}.name`) && 'border-destructive')}
                      value={variant.name}
                      disabled={readOnly}
                      onChange={(e) => update((d) => void (d.variants[index].name = e.target.value))}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className={cn('font-mono text-xs', errorAt(errors, `${path}.sku`) && 'border-destructive')}
                      value={variant.sku}
                      disabled={readOnly}
                      title={errorAt(errors, `${path}.sku`)}
                      onChange={(e) => update((d) => void (d.variants[index].sku = e.target.value))}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={variant.undertone}
                      disabled={readOnly}
                      onValueChange={(value) =>
                        update((d) => void (d.variants[index].undertone = value as UndertoneSetting))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">{t('variants.auto', { hint: auto ? ` (${t(TONE_KEY[auto])})` : '' })}</SelectItem>
                        <SelectItem value="cool">{t('tone.cool')}</SelectItem>
                        <SelectItem value="neutral">{t('tone.neutral')}</SelectItem>
                        <SelectItem value="warm">{t('tone.warm')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={variant.enabled}
                      disabled={readOnly}
                      onCheckedChange={(checked) => update((d) => void (d.variants[index].enabled = checked))}
                      aria-label={t('variants.enabled')}
                    />
                  </TableCell>
                  {readOnly ? null : (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="size-7" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('variants.up')}>
                          <ArrowUp />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={index === variants.length - 1}
                          onClick={() => move(index, 1)}
                          aria-label={t('variants.down')}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => update((d) => void d.variants.splice(index, 1))}
                          aria-label={t('variants.delete')}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {variants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  {t('variants.empty')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <PasteDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onApply={(rows, mode) =>
          update((d) => {
            d.variants = mode === 'replace' ? rows : [...d.variants, ...rows].slice(0, MAX_VARIANTS);
          })
        }
      />
    </Section>
  );
}

function PasteDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (rows: FinderVariant[], mode: 'append' | 'replace') => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const parsed = parsePaste(text);

  function apply(mode: 'append' | 'replace') {
    onApply(parsed.variants, mode);
    setText('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('variants.pasteTitle')}</DialogTitle>
          <DialogDescription>{t('variants.pasteBody')}</DialogDescription>
        </DialogHeader>
        <Textarea
          rows={10}
          className="field-sizing-fixed h-48 resize-none overflow-y-auto font-mono text-xs"
          placeholder={'01 Porcelain\tSKU-01\t#F6DCC8\t冷\n02 Ivory, SKU-02, #F0D3B8, neutral\n03 Beige, SKU-03, E6C4A4'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="text-xs text-muted-foreground">
          {t('variants.parsed', { count: parsed.variants.length })}
          {parsed.problems.length ? (
            <ul className="mt-1 space-y-0.5 text-destructive">
              {parsed.problems.slice(0, 5).map((row) => (
                <li key={row}>{t('variants.rowError', { row })}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={!parsed.variants.length} onClick={() => apply('replace')}>
            {t('variants.replace')}
          </Button>
          <Button disabled={!parsed.variants.length} onClick={() => apply('append')}>
            {t('variants.append')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
