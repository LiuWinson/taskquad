// 跨组件拖拽总线（模块级单例）。
// 不依赖 dataTransfer.types 等浏览器差异行为，四象限 ↔ 每日计划拖拽必然可用。
export interface DragPayload {
  kind: 'quadrant' | 'plan' | 'planBatch';
  id: string;
  /** 计划块被拖拽移动时的原始时长（分钟）；四象限任务为 30 */
  duration: number;
  /** planBatch：一起移动的任务 id 集合 */
  ids?: string[];
  /** 抓取点相对块起点的偏移（分钟，30 倍数）；保持抓取手感 */
  grabOffset?: number;
}

let current: DragPayload | null = null;

export function setDrag(p: DragPayload): void {
  current = p;
}

export function getDrag(): DragPayload | null {
  return current;
}

export function clearDrag(): void {
  current = null;
}
