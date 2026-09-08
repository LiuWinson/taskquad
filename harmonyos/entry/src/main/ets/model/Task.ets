// 任务数据模型与四象限常量（与 docs/API.md 数据模型一致）

export class Task {
  id: string = '';
  title: string = '';
  note: string = '';
  quadrant: string = '';
  dueAt: string = '';
  remindAt: string = '';
  completed: boolean = false;
  completedAt: string = '';
  createdAt: string = '';
  updatedAt: string = '';
  remindedAt: string = '';
  order: number = 0;
}

/** ArkUI 颜色为 #AARRGGBB：在象限主色上加 8% 透明度 */
export function tintOf(color: string): string {
  return '#14' + color.substring(1);
}

export class QuadrantMeta {
  key: string;
  label: string;
  color: string;

  constructor(key: string, label: string, color: string) {
    this.key = key;
    this.label = label;
    this.color = color;
  }
}

export const QUADRANTS: QuadrantMeta[] = [
  new QuadrantMeta('IU', '重要且紧急', '#E5484D'),
  new QuadrantMeta('IN', '重要不紧急', '#3B82F6'),
  new QuadrantMeta('NU', '紧急不重要', '#F59E0B'),
  new QuadrantMeta('NN', '不重要不紧急', '#8B8F98')
];

export function quadrantMeta(key: string): QuadrantMeta {
  for (let i = 0; i < QUADRANTS.length; i++) {
    if (QUADRANTS[i].key === key) {
      return QUADRANTS[i];
    }
  }
  return QUADRANTS[0];
}

export function pad2(n: number): string {
  return n < 10 ? '0' + n.toString() : n.toString();
}

/** 仅日期：2026-01-05 */
export function formatDate(iso: string): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.getFullYear().toString() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** 仅时间：09:30 */
export function formatTime(iso: string): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

/** 展示用：今天 09:30 / 明天 09:30 / 1月5日 09:30 */
export function formatDisplay(iso: string): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const now = new Date();
  const hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) {
    return '今天 ' + hm;
  }
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const sameTomorrow = d.getFullYear() === tomorrow.getFullYear() && d.getMonth() === tomorrow.getMonth() && d.getDate() === tomorrow.getDate();
  if (sameTomorrow) {
    return '明天 ' + hm;
  }
  return (d.getMonth() + 1).toString() + '月' + d.getDate().toString() + '日 ' + hm;
}

/** 未完成且已过截止时间 */
export function isOverdue(dueAt: string): boolean {
  if (!dueAt) {
    return false;
  }
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) {
    return false;
  }
  return d.getTime() < Date.now();
}
