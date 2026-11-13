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
import { newLocalId } from '@/lib/finders';
import { cn } from '@/lib/utils';
import { Section, errorAt, type SectionProps } from './shared';

export const UNDERTONE_LABEL: Record<Undertone, string> = { cool: '冷', neutral: '中性', warm: '暖' };

function autoTone(hex: string): Undertone | null {
  const normalized = normalizeHex(hex);
  return normalized ? resolveVariantUndertone({ id: '', hex: normalized }, hexToLab(normalized)) : null;
}

function blankVariant(index: number): FinderVariant {
  return {
    id: newLocalId('v'),
    name: `Shade ${index + 1}`,
    sku: '',
    hex: '#E0B898',
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
  problems: string[];
}

function parsePaste(text: string): ParsedPaste {
  const variants: FinderVariant[] = [];
  const problems: string[] = [];
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const cells = line.split(/\t|,|，/).map((cell) => cell.trim());
      const [name, sku, hexRaw, toneRaw] = cells;
      const hex = normalizeHex(hexRaw);
      if (!name || !hex) {
        problems.push(`第 ${index + 1} 行：需要「名称, SKU, 色值」，色值如 #E0B898`);
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
      title={`色号变体（${variants.length}）`}
      description="色值决定推荐结果；色调选「自动」时按色值自动判断冷/中/暖。停用的色号不会参与推荐。"
      actions={
        readOnly ? null : (
          <>
            <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste /> 批量粘贴
            </Button>
            <Button
              size="sm"
              disabled={variants.length >= MAX_VARIANTS}
              onClick={() => update((d) => void d.variants.push(blankVariant(d.variants.length)))}
            >
              <Plus /> 添加色号
            </Button>
          </>
        )
      }
    >
      {errorAt(errors, 'variants') ? <p className="text-sm text-destructive">{errorAt(errors, 'variants')}</p> : null}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="min-w-44">色值</TableHead>
              <TableHead className="min-w-40">名称</TableHead>
              <TableHead className="min-w-32">SKU</TableHead>
              <TableHead className="min-w-36">色调</TableHead>
              <TableHead className="w-16">启用</TableHead>
              {readOnly ? null : <TableHead className="w-28 text-right">排序 / 删除</TableHead>}
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
                      aria-label={`第 ${index + 1} 行色值`}
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
                        <SelectItem value="auto">自动{auto ? `（${UNDERTONE_LABEL[auto]}）` : ''}</SelectItem>
                        <SelectItem value="cool">冷</SelectItem>
                        <SelectItem value="neutral">中性</SelectItem>
                        <SelectItem value="warm">暖</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={variant.enabled}
                      disabled={readOnly}
                      onCheckedChange={(checked) => update((d) => void (d.variants[index].enabled = checked))}
                      aria-label="启用"
                    />
                  </TableCell>
                  {readOnly ? null : (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="size-7" disabled={index === 0} onClick={() => move(index, -1)} aria-label="上移">
                          <ArrowUp />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={index === variants.length - 1}
                          onClick={() => move(index, 1)}
                          aria-label="下移"
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => update((d) => void d.variants.splice(index, 1))}
                          aria-label="删除"
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
                  还没有色号。可以逐个添加，或从表格复制后「批量粘贴」。
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
          <DialogTitle>批量粘贴色号</DialogTitle>
          <DialogDescription>
            每行一个色号：名称、SKU、色值、色调（可省略，默认自动）。可直接从 Excel 复制几列粘贴进来。
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={10}
          className="field-sizing-fixed h-48 resize-none overflow-y-auto font-mono text-xs"
          placeholder={'01 Porcelain\tSKU-01\t#F6DCC8\t冷\n02 Ivory, SKU-02, #F0D3B8, neutral\n03 Beige, SKU-03, E6C4A4'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="text-xs text-muted-foreground">
          识别到 {parsed.variants.length} 个色号
          {parsed.problems.length ? (
            <ul className="mt-1 space-y-0.5 text-destructive">
              {parsed.problems.slice(0, 5).map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={!parsed.variants.length} onClick={() => apply('replace')}>
            替换现有全部
          </Button>
          <Button disabled={!parsed.variants.length} onClick={() => apply('append')}>
            追加到末尾
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
