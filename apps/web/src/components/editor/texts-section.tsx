import type { FinderSettings } from '@tryon/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Field, Section, type SectionProps } from './shared';

type LabelKey = keyof FinderSettings['labels'];

const LABEL_GROUPS: { title: string; items: [LabelKey, string][] }[] = [
  {
    title: '入口与相机',
    items: [
      ['detecting', '相机启动中'],
      ['cameraDenied', '相机权限被拒'],
      ['moveFace', '没检测到脸'],
      ['holdChecks', '检测条件提示'],
      ['holdStill', '保持不动'],
      ['holdHint', '采集中提示'],
      ['manualPick', '采集失败'],
      ['skinReady', '采集成功'],
    ],
  },
  {
    title: '检测项',
    items: [
      ['gateLighting', '光线'],
      ['gateStraight', '正脸'],
      ['gatePosition', '位置'],
    ],
  },
  {
    title: '结果页',
    items: [
      ['matchLighter', '偏浅标签'],
      ['matchBest', '最佳标签'],
      ['matchDeeper', '偏深标签'],
      ['emptyColumn', '无色号占位'],
      ['scanAgain', '重新扫描'],
    ],
  },
];

export function TextsSection({ draft, update, readOnly }: SectionProps) {
  const { feedback, privacy, labels } = draft.settings;

  return (
    <div className="space-y-3">
      <Section
        title="深浅反馈"
        description="结果出来几秒后弹出「偏浅 / 刚好 / 偏深」，数据页会按色号统计，用来调整匹配阈值。"
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="fb-enabled" className="mb-0">
              {feedback.enabled ? '已开启' : '已关闭'}
            </Label>
            <Switch
              id="fb-enabled"
              checked={feedback.enabled}
              disabled={readOnly}
              onCheckedChange={(checked) => update((d) => void (d.settings.feedback.enabled = checked))}
            />
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="弹出延迟（秒）">
            <Input
              type="number"
              min={0}
              max={60}
              value={feedback.delaySeconds}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.feedback.delaySeconds = Number(e.target.value)))}
            />
          </Field>
          <Field label="标题" className="md:col-span-2">
            <Input
              value={feedback.title}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.feedback.title = e.target.value))}
            />
          </Field>
          <Field label="偏浅">
            <Input
              value={feedback.lighterLabel}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.feedback.lighterLabel = e.target.value))}
            />
          </Field>
          <Field label="刚好">
            <Input
              value={feedback.justRightLabel}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.feedback.justRightLabel = e.target.value))}
            />
          </Field>
          <Field label="偏深">
            <Input
              value={feedback.deeperLabel}
              disabled={readOnly}
              onChange={(e) => update((d) => void (d.settings.feedback.deeperLabel = e.target.value))}
            />
          </Field>
        </div>
      </Section>

      <Section title="隐私提示" description="填写后，打开页面会先显示这段说明并要求确认；留空则直接打开相机。">
        <Field label="提示内容">
          <Textarea
            rows={3}
            value={privacy.note}
            disabled={readOnly}
            placeholder="We only analyze your skin tone on this device. No photos are uploaded or stored."
            onChange={(e) => update((d) => void (d.settings.privacy.note = e.target.value))}
          />
        </Field>
        <Field label="确认按钮" className="md:w-1/3">
          <Input
            value={privacy.confirmLabel}
            disabled={readOnly}
            onChange={(e) => update((d) => void (d.settings.privacy.confirmLabel = e.target.value))}
          />
        </Field>
      </Section>

      <Section title="扫码页文案" description="页面上所有的提示文字，可按市场改成对应语言。">
        {LABEL_GROUPS.map((group) => (
          <div key={group.title} className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{group.title}</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map(([key, name]) => (
                <Field key={key} label={name}>
                  <Input
                    value={labels[key]}
                    disabled={readOnly}
                    onChange={(e) => update((d) => void (d.settings.labels[key] = e.target.value))}
                  />
                </Field>
              ))}
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}
