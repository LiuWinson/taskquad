// TaskQuad 前端类型定义，字段与 docs/API.md 的数据模型严格一致。

export type QuadrantKey = 'IU' | 'IN' | 'NU' | 'NN';

export interface Task {
  id: string;
  title: string;
  note: string;
  quadrant: QuadrantKey;
  dueAt: string | null;
  remindAt: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  remindedAt: string | null;
  /** 象限内排序值（服务端维护，浮点；拖拽时取相邻值中点） */
  order: number;
  /** 每日计划：日期 YYYY-MM-DD（本地） */
  planDate: string | null;
  /** 计划开始时间（当天分钟数，30 的倍数） */
  planStart: number | null;
  /** 计划结束时间（当天分钟数，30 的倍数，> planStart） */
  planEnd: number | null;
  /** 计划完成百分比反馈 0-100；null = 未反馈 */
  planProgress: number | null;
  /** 计划结束待反馈通知是否已发 */
  planEndNotified: boolean;
  /** 循环类型：none/daily/weekly/monthly/quarterly */
  repeat: RepeatType;
  /** 循环任务按日期的完成记录：{ 'YYYY-MM-DD': { completed?, progress?, notified? } } */
  occurrences: Record<string, Occurrence>;
  /** 番茄工作法记录（最新在后） */
  pomodoros: PomodoroRecord[];
}

export type RepeatType = 'none' | 'daily' | 'weekly' | 'monthly' | 'quarterly';

export type PomodoroStatus = 'running' | 'completed' | 'interrupted';

export interface PomodoroRecord {
  id: string;
  startAt: string;
  endAt: string | null;
  plannedMin: number;
  status: PomodoroStatus;
  reason: string | null;
}

export interface Occurrence {
  completed?: boolean;
  progress?: number;
  notified?: boolean;
}

export interface Quadrant {
  key: QuadrantKey;
  label: string;
  color: string;
}

// 四象限 key 为固定值，禁止修改。
export const QUADRANTS: Quadrant[] = [
  { key: 'IU', label: '重要且紧急', color: '#E5484D' },
  { key: 'IN', label: '重要不紧急', color: '#3B82F6' },
  { key: 'NU', label: '紧急不重要', color: '#F59E0B' },
  { key: 'NN', label: '不重要不紧急', color: '#8B8F98' },
];

const QUADRANT_MAP = new Map<QuadrantKey, Quadrant>(
  QUADRANTS.map((q) => [q.key, q]),
);

export function quadrantOf(key: QuadrantKey): Quadrant {
  return QUADRANT_MAP.get(key) ?? QUADRANTS[0];
}

export function isQuadrantKey(value: unknown): value is QuadrantKey {
  return (
    typeof value === 'string' &&
    (value === 'IU' || value === 'IN' || value === 'NU' || value === 'NN')
  );
}
