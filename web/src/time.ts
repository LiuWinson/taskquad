// 时间显示与互转辅助函数。
// 所有日期展示按本地时区处理；datetime-local 值与 ISO 字符串的互转遵循本文件约定。

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 判断给定 ISO 字符串是否能解析为有效日期。 */
function isValid(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/** 判断 ISO 字符串（不含日期）是否落在「今天」本地日范围内。 */
function isSameLocalDay(d: Date, ref: Date): boolean {
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

/**
 * 展示用时间：今天显示「今天 HH:mm」，明天显示「明天 HH:mm」，
 * 其余显示「M月d日 HH:mm」。无日期返回空字符串。
 */
export function formatDisplayTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!isValid(d)) return '';
  const now = new Date();
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (isSameLocalDay(d, now)) return `今天 ${hm}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (isSameLocalDay(d, tomorrow)) return `明天 ${hm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

/** 仅用于归档分组头：显示「M月d日」。 */
export function formatMonthDay(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!isValid(d)) return '';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 仅显示时间 HH:mm（用于看板徽标等紧凑场景）。 */
export function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!isValid(d)) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * ISO → datetime-local 值（'YYYY-MM-DDTHH:mm'）。
 * 按本地时区取 getFullYear/getMonth 等字段拼接。
 */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!isValid(d)) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`;
}

/**
 * datetime-local 值（'YYYY-MM-DDTHH:mm'）→ ISO 字符串。
 * 空值返回 null。
 */
export function localInputToIso(local: string): string | null {
  const trimmed = local.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (!isValid(d)) return null;
  return d.toISOString();
}

/** Date → datetime-local 值，用于快捷提醒按钮填充。 */
export function dateToLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`;
}

/** 判断未完成任务是否已逾期。 */
export function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  const d = new Date(dueAt);
  return isValid(d) && d.getTime() < Date.now();
}

/** 判断截止时间是否属于今天（非逾期，用于列表分组）。 */
export function isToday(dueAt: string | null): boolean {
  if (!dueAt) return false;
  const d = new Date(dueAt);
  return isValid(d) && isSameLocalDay(d, new Date());
}
