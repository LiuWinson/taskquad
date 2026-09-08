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
