<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { Task, RepeatType } from '../types';
import { quadrantOf } from '../types';
import { matchesRepeat, repeatLabel, pomodoroStats } from '../time';
import { setDrag, getDrag, clearDrag as clearBus } from '../dragBus';

const props = defineProps<{
  tasks: Task[];
  /** App 层维护的"今天"（跨天时更新），用于自动跟随到最新今天 */
  todayKey: string;
}>();

const emit = defineEmits<{
  schedule: [taskId: string, planDate: string, start: number, end: number];
  moveBlock: [taskId: string, planDate: string, start: number, end: number];
  moveBlocks: [moves: { id: string; start: number; end: number }[]];
  setProgress: [taskId: string, progress: number | null];
  complete: [taskId: string];
  removePlan: [taskId: string];
  edit: [task: Task];
  setRepeat: [taskId: string, repeat: RepeatType];
  occProgress: [taskId: string, date: string, progress: number | null];
  occComplete: [taskId: string, date: string, done: boolean];
  stopRepeat: [taskId: string];
  pomodoro: [taskId: string];
}>();

const REPEAT_OPTIONS: { value: RepeatType; label: string }[] = [
  { value: 'none', label: '不循环' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季度' },
];

const SLOT_H = 28; // 每个半小时槽位像素高度
const DAY_START = 420; // 工作时间轴起点 07:00（分钟）
const DAY_END = 1380; // 工作时间轴终点 23:00（分钟）

// ---------- 日期 ----------
function fmtDate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayStr(): string {
  return fmtDate(new Date());
}
const dateStr = ref(todayStr());

// 跨天/重新打开窗口时：若仍停留在旧"今天"，自动跟随到新今天；手动翻到别的日期则不打扰
watch(
  () => props.todayKey,
  (n, o) => {
    if (o && dateStr.value === o) {
      dateStr.value = n;
    }
  },
);

function shiftDay(delta: number) {
  const d = new Date(dateStr.value + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  dateStr.value = fmtDate(d);
}
const isToday = computed(() => dateStr.value === todayStr());
const dateLabel = computed(() => {
  const d = new Date(dateStr.value + 'T00:00:00');
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  const base = `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
  return isToday.value ? `今天 · ${base}` : base;
});

// ---------- 槽位与计划块 ----------
function fmtMin(m: number): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(Math.floor(m / 60))}:${p(m % 60)}`;
}

const dayBlocks = computed<Task[]>(() =>
  props.tasks
    .filter(
      (t) =>
        !t.completed &&
        t.planDate &&
        typeof t.planStart === 'number' &&
        typeof t.planEnd === 'number' &&
        (t.repeat && t.repeat !== 'none'
          ? matchesRepeat(t.planDate, t.repeat, dateStr.value)
          : t.planDate === dateStr.value),
    )
    .sort((a, b) => (a.planStart! - b.planStart!) || a.order - b.order),
);

/** 循环任务：当天的完成记录 */
function occurrenceOf(t: Task): { completed?: boolean; progress?: number; notified?: boolean } {
  const map = (t.occurrences || {}) as Record<string, { completed?: boolean; progress?: number; notified?: boolean }>;
  return map[dateStr.value] || {};
}

/** 该块在当天是否已完成（循环任务按当天记录，非循环按任务本体） */
function blockDone(t: Task): boolean {
  if (t.repeat && t.repeat !== 'none') return !!occurrenceOf(t).completed;
  return t.completed;
}

/** 块显示的进度：循环任务取当天记录，非循环取任务本体 */
function occProgressOf(t: Task): number | null {
  if (t.repeat && t.repeat !== 'none') {
    const occ = occurrenceOf(t);
    return typeof occ.progress === 'number' ? occ.progress : null;
  }
  return t.planProgress;
}

/** 该分钟是否有计划块覆盖（用于冲突检测） */
function blockCovering(min: number, excludeId: string | null = null): Task | null {
  for (const t of dayBlocks.value) {
    if (excludeId && t.id === excludeId) continue;
    if (t.planStart! <= min && min < t.planEnd!) return t;
  }
  return null;
}

const nowMin = computed(() => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
});

function isPending(t: Task): boolean {
  if (typeof t.planEnd !== 'number' || t.planEnd > nowMin.value || !isToday.value) return false;
  if (blockDone(t)) return false;
  if (t.repeat && t.repeat !== 'none') {
    const occ = occurrenceOf(t);
    return occ.progress == null;
  }
  return t.planProgress == null;
}

// ---------- Ctrl 多选 ----------
const selectedIds = ref<string[]>([]);

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id);
}

function toggleSelect(id: string) {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((x) => x !== id);
  } else {
    selectedIds.value = [...selectedIds.value, id];
  }
}

function clearSelection() {
  selectedIds.value = [];
}

function onBlockClick(e: MouseEvent, t: Task) {
  // 边缘缩放松手后合成的 click：吞掉，不打开详情
  if (resizeHandled) {
    resizeHandled = false;
    return;
  }
  if (e.ctrlKey || e.metaKey) {
    e.stopPropagation();
    toggleSelect(t.id);
  } else {
    if (!isSelected(t.id)) clearSelection();
    openEditor(t);
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') clearSelection();
}

onMounted(() => {
  window.addEventListener('dragend', clearLocalDrag);
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  window.removeEventListener('dragend', clearLocalDrag);
  window.removeEventListener('keydown', onKeydown);
});

// ---------- 拖拽（拖拽总线）：四象限任务 → 槽位；计划块 → 其他槽位/四象限 ----------
const hoverSlot = ref<number | null>(null);

/** 指针所在位置对应的槽位起始分钟（按时间轴像素位置换算） */
function pointerSlotMin(e: MouseEvent | DragEvent): number {
  const el = e.currentTarget as HTMLElement;
  const grid = el.closest('.plan-grid') as HTMLElement | null;
  if (!grid) return DAY_START;
  const rect = grid.getBoundingClientRect();
  const idx = Math.floor((e.clientY - rect.top) / SLOT_H);
  return DAY_START + Math.max(0, Math.min(31, idx)) * 30;
}

function onBlockDragStart(e: DragEvent, t: Task) {
  const dur = t.planEnd! - t.planStart! || 30;
  // 抓取点偏移：指针落在块内哪个半小时格，拖动时保持该相对位置
  const raw = pointerSlotMin(e) - (t.planStart ?? DAY_START);
  const grabOffset = Math.min(dur - 30, Math.max(0, Math.round(raw / 30) * 30));
  if (isSelected(t.id) && selectedIds.value.length > 1) {
    // 多选整体拖动：记录全量选中集合
    setDrag({ kind: 'planBatch', id: t.id, duration: dur, ids: [...selectedIds.value], grabOffset });
  } else {
    if (!isSelected(t.id)) clearSelection();
    setDrag({ kind: 'plan', id: t.id, duration: dur, grabOffset });
  }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.id);
  }
}

// ---------- 批量拖拽投影预览（幽灵块） ----------
const batchPreview = ref<{ delta: number; ids: string[] } | null>(null);

interface Ghost {
  id: string;
  title: string;
  color: string;
  start: number;
  end: number;
  invalid: boolean;
  top: string;
  height: string;
}

const batchGhosts = computed<Ghost[]>(() => {
  const p = batchPreview.value;
  if (!p) return [];
  const out: Ghost[] = [];
  for (const id of p.ids) {
    const b = dayBlocks.value.find((x) => x.id === id);
    if (!b) continue;
    const start = (b.planStart ?? DAY_START) + p.delta;
    const end = (b.planEnd ?? start + 30) + p.delta;
    const invalid = start < DAY_START || end > DAY_END;
    const cs = Math.max(start, DAY_START);
    const ce = Math.min(end, DAY_END);
    const dur = Math.max(30, ce - cs);
    out.push({
      id,
      title: b.title,
      color: quadrantOf(b.quadrant).color,
      start,
      end,
      invalid,
      top: `${((cs - DAY_START) / 30) * SLOT_H + 1}px`,
      height: `${(dur / 30) * SLOT_H - 2}px`,
    });
  }
  return out;
});

/** 时间轴容器级 dragover：直接按鼠标坐标换算槽位，
 *  不受指针下方元素（计划块等）影响，投影严格按半小时格平滑移动 */
function onGridDragOver(e: DragEvent) {
  const drag = getDrag();
  if (!drag) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  const min = pointerSlotMin(e);
  hoverSlot.value = min;
  if (drag.kind === 'planBatch') {
    const dragged = dayBlocks.value.find((b) => b.id === drag.id);
    if (!dragged) {
      batchPreview.value = null;
    } else {
      const delta = min - (drag.grabOffset ?? 0) - (dragged.planStart ?? DAY_START);
      // 位移为 0（投影与原位置重合）时不显示投影，避免干扰判断
      batchPreview.value = delta === 0 ? null : { delta, ids: drag.ids ?? [drag.id] };
    }
  } else {
    batchPreview.value = null;
  }
}

/** 批量整体移动/平移：对选中集合做边界与冲突校验，全部通过才提交 */
function applyBatchShift(ids: string[], deltaMin: number): boolean {
  if (deltaMin === 0 || ids.length === 0) return false;
  const blocks = dayBlocks.value.filter((b) => ids.includes(b.id));
  if (blocks.length === 0) return false;
  const moves = blocks.map((b) => ({
    id: b.id,
    start: (b.planStart ?? DAY_START) + deltaMin,
    end: (b.planEnd ?? DAY_START + 30) + deltaMin,
  }));
  // 工作时间轴边界
  for (const mv of moves) {
    if (mv.start < DAY_START || mv.end > DAY_END) {
      window.alert('整体移动后超出工作时间轴（07:00-23:00），已取消');
      return false;
    }
  }
  // 冲突检测（排除所有选中块）
  for (const mv of moves) {
    for (let m = mv.start; m < mv.end; m += 30) {
      const hit = blockCovering(m, null);
      if (hit && !ids.includes(hit.id)) {
        window.alert(`移动后与「${hit.title}」冲突，已取消`);
        return false;
      }
    }
  }
  emit('moveBlocks', moves);
  return true;
}

function onGridDrop(e: DragEvent) {
  const drag = getDrag();
  if (!drag) return;
  e.preventDefault();
  const startMin = pointerSlotMin(e);
  if (drag.kind === 'planBatch') {
    const dragged = dayBlocks.value.find((b) => b.id === drag.id);
    if (dragged) {
      applyBatchShift(drag.ids ?? [drag.id], startMin - (drag.grabOffset ?? 0) - (dragged.planStart ?? DAY_START));
    }
    clearLocalDrag();
    return;
  }
  // 单块移动/排期：按抓取点对齐（保持抓取手感）
  const grab = drag.kind === 'plan' ? (drag.grabOffset ?? 0) : 0;
  const newStart = startMin - grab;
  const endMin = drag.kind === 'plan' ? newStart + drag.duration : startMin + 30;
  if (drag.kind === 'plan') {
    // 工作时间轴边界
    if (newStart < DAY_START || endMin > DAY_END) {
      window.alert('超出工作时间轴（07:00-23:00），已取消');
      clearLocalDrag();
      return;
    }
    // 计划块移动：先冲突检测（排除自身）
    for (let m = newStart; m < endMin; m += 30) {
      const hit = blockCovering(m, drag.id);
      if (hit && hit.id !== drag.id) {
        window.alert(`该时间段与「${hit.title}」冲突`);
        clearLocalDrag();
        return;
      }
    }
    emit('moveBlock', drag.id, dateStr.value, newStart, endMin);
  } else {
    // 四象限任务 → 计划：冲突检测
    for (let m = startMin; m < endMin; m += 30) {
      const hit = blockCovering(m);
      if (hit) {
        window.alert(`该时间段与「${hit.title}」冲突`);
        clearLocalDrag();
        return;
      }
    }
    emit('schedule', drag.id, dateStr.value, startMin, endMin);
  }
  clearLocalDrag();
}

function clearLocalDrag() {
  hoverSlot.value = null;
  batchPreview.value = null;
  clearBus();
}

// ---------- 鼠标拖拽计划块上下边缘，调整覆盖时间段（半小时步进，实时预览） ----------
interface ResizeState {
  id: string;
  mode: 'top' | 'bottom';
  baseStart: number;
  baseEnd: number;
  originY: number;
  start: number;
  end: number;
}
const resizing = ref<ResizeState | null>(null);
/** 缩放把手按下后抑制紧随的 click（避免松手误开任务详情） */
let resizeHandled = false;

function onHandleDown(e: PointerEvent, t: Task, mode: 'top' | 'bottom') {
  e.preventDefault();
  e.stopPropagation();
  clearSelection();
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture(e.pointerId);
  resizeHandled = true;
  resizing.value = {
    id: t.id,
    mode,
    baseStart: t.planStart!,
    baseEnd: t.planEnd!,
    originY: e.clientY,
    start: t.planStart!,
    end: t.planEnd!,
  };
}

function onHandleMove(e: PointerEvent) {
  const r = resizing.value;
  if (!r) return;
  const deltaMin = Math.round((e.clientY - r.originY) / (SLOT_H / 30) / 30) * 30;
  if (r.mode === 'bottom') {
    r.end = Math.min(DAY_END, Math.max(r.baseStart + 30, r.baseEnd + deltaMin));
  } else {
    r.start = Math.max(DAY_START, Math.min(r.baseEnd - 30, r.baseStart + deltaMin));
  }
}

function onHandleUp() {
  const r = resizing.value;
  if (!r) return;
  resizing.value = null;
  // 释放后浏览器会合成一次 click：短暂保留标记，让块级 click 吞掉这次误触
  window.setTimeout(() => {
    resizeHandled = false;
  }, 150);
  if (r.end <= r.start) return;
  for (let m = r.start; m < r.end; m += 30) {
    const hit = blockCovering(m, r.id);
    if (hit) {
      window.alert(`该时间段与「${hit.title}」冲突`);
      return;
    }
  }
  emit('moveBlock', r.id, dateStr.value, r.start, r.end);
}

function onHandleCancel() {
  resizing.value = null;
  window.setTimeout(() => {
    resizeHandled = false;
  }, 150);
}

// ---------- 空槽位点按：从任务列表选择（触屏/无拖拽场景） ----------
const pickSlot = ref<number | null>(null);
const pickable = computed<Task[]>(() =>
  props.tasks.filter(
    (t) => !t.completed && !(t.planDate === dateStr.value && typeof t.planStart === 'number'),
  ),
);
function pickTaskForSlot(t: Task) {
  if (pickSlot.value == null) return;
  emit('schedule', t.id, dateStr.value, pickSlot.value, pickSlot.value + 30);
  pickSlot.value = null;
}

// ---------- 计划块编辑弹层 ----------
const editing = ref<Task | null>(null);
const editStart = ref(0);
const editEnd = ref(30);
const editProgress = ref(50);
const editRepeat = ref<RepeatType>('none');

function openEditor(t: Task) {
  editing.value = t;
  editStart.value = t.planStart ?? 0;
  editEnd.value = t.planEnd ?? (t.planStart ?? 0) + 30;
  if (t.repeat && t.repeat !== 'none') {
    const occ = occurrenceOf(t);
    editProgress.value = occ.progress ?? 50;
  } else {
    editProgress.value = t.planProgress ?? 50;
  }
  editRepeat.value = (t.repeat ?? 'none') as RepeatType;
}
function closeEditor() {
  editing.value = null;
}
function saveRange() {
  if (!editing.value) return;
  const s = Math.round(editStart.value / 30) * 30;
  const e = Math.round(editEnd.value / 30) * 30;
  if (e <= s) {
    window.alert('结束时间必须晚于开始时间');
    return;
  }
  for (let m = s; m < e; m += 30) {
    const hit = blockCovering(m, editing.value.id);
    if (hit) {
      window.alert(`该时间段与「${hit.title}」冲突`);
      return;
    }
  }
  emit('moveBlock', editing.value.id, dateStr.value, s, e);
  closeEditor();
}
function saveProgress() {
  if (!editing.value) return;
  const t = editing.value;
  if (t.repeat && t.repeat !== 'none') {
    emit('occProgress', t.id, dateStr.value, editProgress.value);
  } else {
    emit('setProgress', t.id, editProgress.value);
  }
  closeEditor();
}
function doComplete() {
  if (!editing.value) return;
  const t = editing.value;
  if (t.repeat && t.repeat !== 'none') {
    emit('occComplete', t.id, dateStr.value, true);
  } else {
    emit('complete', t.id);
  }
  closeEditor();
}
function doUndoComplete() {
  if (!editing.value) return;
  emit('occComplete', editing.value.id, dateStr.value, false);
  closeEditor();
}
function saveRepeat() {
  if (!editing.value) return;
  emit('setRepeat', editing.value.id, editRepeat.value);
  closeEditor();
}
function doRemovePlan() {
  if (!editing.value) return;
  const t = editing.value;
  if (t.repeat && t.repeat !== 'none') {
    emit('stopRepeat', t.id); // 停止循环并移出计划
  } else {
    emit('removePlan', t.id);
  }
  closeEditor();
}
function doEditTask() {
  if (!editing.value) return;
  emit('edit', editing.value);
  closeEditor();
}
function doPomodoro() {
  if (!editing.value) return;
  const id = editing.value.id;
  closeEditor();
  emit('pomodoro', id);
}
function pomoOf(t: Task): { done: number; interrupted: number; lastReason: string | null } {
  return pomodoroStats(t.pomodoros);
}

// 时间选择项（半小时粒度，仅工作时间轴 07:00-23:00）
const startOptions: number[] = [];
for (let m = DAY_START; m < DAY_END; m += 30) {
  startOptions.push(m);
}
const endOptions: number[] = [];
for (let m = DAY_START + 30; m <= DAY_END; m += 30) {
  endOptions.push(m);
}
const slotStarts: number[] = [];
for (let m = DAY_START; m < DAY_END; m += 30) {
  slotStarts.push(m);
}
const quickPercents = [25, 50, 75, 100];

function slotHovered(startMin: number): boolean {
  if (hoverSlot.value == null) return false;
  const drag = getDrag();
  if (!drag) return false;
  if (drag.kind === 'planBatch') {
    // 批量拖拽：仅在有投影（位移非零）时高亮所有选中块的投影范围
    if (!batchPreview.value) return false;
    const delta = batchPreview.value.delta;
    for (const id of batchPreview.value.ids) {
      const b = dayBlocks.value.find((x) => x.id === id);
      if (!b) continue;
      const ps = (b.planStart ?? DAY_START) + delta;
      const pe = (b.planEnd ?? ps + 30) + delta;
      if (startMin >= ps && startMin < pe) return true;
    }
    return false;
  }
  // 单块：按抓取点对齐的高亮窗口
  const grab = drag.kind === 'plan' ? (drag.grabOffset ?? 0) : 0;
  const s = hoverSlot.value - grab;
  const len = drag.duration;
  return startMin >= s && startMin < s + len;
}

/** 计划块矩形（缩放中实时预览；超出工作时间轴的部分裁剪显示） */
function blockRect(t: Task): { top: string; height: string; hidden: boolean } {
  let start = t.planStart ?? DAY_START;
  let end = t.planEnd ?? start + 30;
  if (resizing.value && resizing.value.id === t.id) {
    start = resizing.value.start;
    end = resizing.value.end;
  }
  if (end <= DAY_START || start >= DAY_END) {
    return { top: '0px', height: '0px', hidden: true };
  }
  const cs = Math.max(start, DAY_START);
  const ce = Math.min(end, DAY_END);
  const dur = Math.max(30, ce - cs);
  return {
    top: `${((cs - DAY_START) / 30) * SLOT_H + 1}px`,
    height: `${(dur / 30) * SLOT_H - 2}px`,
    hidden: false,
  };
}
</script>

<template>
  <div class="plan-panel">
    <div class="plan-head">
      <div class="plan-nav">
        <button class="plan-nav-btn" title="前一天" @click="shiftDay(-1)">◀</button>
        <span class="plan-date">{{ dateLabel }}</span>
        <button class="plan-nav-btn" title="后一天" @click="shiftDay(1)">▶</button>
      </div>
      <button v-if="!isToday" class="plan-today-btn" @click="dateStr = todayStr()">
        回到今天
      </button>
      <span class="plan-count">{{ dayBlocks.length }} 项</span>
    </div>

    <div class="plan-hint">
      工作时间轴 07:00-23:00 · Ctrl+点击计划块可多选，拖动或平移批量调整 · 拖动上下边缘调时长
    </div>

    <!-- 多选工具条 -->
    <div v-if="selectedIds.length > 0" class="plan-batch-bar">
      <span class="plan-batch-count">已选 {{ selectedIds.length }} 项</span>
      <button
        class="plan-mini-btn"
        title="整体前移 30 分钟"
        @click="applyBatchShift(selectedIds, -30)"
      >
        ⏪ 前移30分
      </button>
      <button
        class="plan-mini-btn"
        title="整体后移 30 分钟"
        @click="applyBatchShift(selectedIds, 30)"
      >
        后移30分 ⏩
      </button>
      <button class="plan-mini-btn danger-text" @click="clearSelection">取消选择</button>
    </div>

    <div class="plan-scroll">
      <div
        class="plan-grid"
        :style="{ height: slotStarts.length * SLOT_H + 'px' }"
        @dragover="onGridDragOver"
        @drop="onGridDrop"
      >
        <!-- 现在时间线（工作时间轴内才显示） -->
        <div
          v-if="isToday && nowMin >= DAY_START && nowMin < DAY_END"
          class="plan-now"
          :style="{ top: ((nowMin - DAY_START) / 30) * SLOT_H + 'px' }"
        ></div>

        <!-- 32 个半小时槽位（07:00-23:00） -->
        <div
          v-for="(m, i) in slotStarts"
          :key="m"
          class="plan-slot"
          :class="{
            'slot-hover': slotHovered(m),
            'slot-hour': m % 60 === 0,
          }"
          :style="{ top: i * SLOT_H + 'px' }"
          @click="clearSelection(); pickSlot = m"
        >
          <span v-if="m % 60 === 0" class="slot-label">{{ fmtMin(m) }}</span>
        </div>

        <!-- 计划块（带上下边缘缩放把手） -->
        <div
          v-for="t in dayBlocks"
          v-show="!blockRect(t).hidden"
          :key="t.id"
          class="plan-block"
          :class="{
            'plan-pending': isPending(t),
            'plan-done': blockDone(t),
            'plan-resizing': resizing && resizing.id === t.id,
            'plan-selected': isSelected(t.id),
            'batch-source': batchPreview && batchPreview.ids.includes(t.id),
          }"
          :style="{ ...blockRect(t), '--plan-color': quadrantOf(t.quadrant).color }"
          draggable="true"
          @dragstart="onBlockDragStart($event, t)"
          @click.stop="onBlockClick($event, t)"
        >
          <div
            class="plan-resize top"
            title="拖动调整开始时间"
            @dragstart.prevent.stop
            @pointerdown="onHandleDown($event, t, 'top')"
            @pointermove="onHandleMove"
            @pointerup="onHandleUp"
            @pointercancel="onHandleCancel"
          ></div>
          <span class="plan-block-title">
            <template v-if="t.repeat && t.repeat !== 'none'">🔁 </template>{{ t.title }}
          </span>
          <span class="plan-block-meta">
            {{ fmtMin(t.planStart!) }}-{{ fmtMin(t.planEnd!) }}
            <template v-if="t.repeat && t.repeat !== 'none'"> · {{ repeatLabel(t.repeat) }}</template>
            <template v-if="blockDone(t)"> · ✓ 已完成</template>
            <template v-else-if="occProgressOf(t) != null"> · {{ occProgressOf(t) }}%</template>
            <template v-else-if="isPending(t)"> · ⏰ 待反馈</template>
          </span>
          <div
            class="plan-resize bottom"
            title="拖动调整结束时间"
            @dragstart.prevent.stop
            @pointerdown="onHandleDown($event, t, 'bottom')"
            @pointermove="onHandleMove"
            @pointerup="onHandleUp"
            @pointercancel="onHandleCancel"
          ></div>
        </div>

        <!-- 批量拖拽投影（幽灵块）：显示所有选中块的目标位置 -->
        <div
          v-for="g in batchGhosts"
          :key="'g' + g.id"
          class="plan-ghost"
          :class="{ 'ghost-invalid': g.invalid }"
          :style="{ top: g.top, height: g.height, '--plan-color': g.color }"
        >
          <span class="plan-block-title">{{ g.title }}</span>
          <span class="plan-block-meta">
            {{ fmtMin(g.start) }}-{{ fmtMin(g.end) }}
            <template v-if="g.invalid"> · 超出工作时间轴</template>
          </span>
        </div>
      </div>
    </div>

    <!-- 空槽位 → 选任务安排 -->
    <div v-if="pickSlot != null" class="plan-overlay" @click.self="pickSlot = null">
      <div class="plan-pop">
        <div class="plan-pop-head">
          <strong>安排任务到 {{ fmtMin(pickSlot) }}-{{ fmtMin(pickSlot + 30) }}</strong>
          <button class="modal-close" @click="pickSlot = null">×</button>
        </div>
        <div class="plan-pick-list">
          <div v-if="pickable.length === 0" class="plan-empty">没有可安排的任务</div>
          <button
            v-for="t in pickable"
            :key="t.id"
            class="plan-pick-item"
            @click="pickTaskForSlot(t)"
          >
            <span
              class="plan-pick-dot"
              :style="{ background: quadrantOf(t.quadrant).color }"
            ></span>
            <span class="plan-pick-title">{{ t.title }}</span>
            <span class="plan-pick-tag">{{ quadrantOf(t.quadrant).label }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 计划块编辑 -->
    <div v-if="editing" class="plan-overlay" @click.self="closeEditor">
      <div class="plan-pop">
        <div class="plan-pop-head">
          <strong>{{ editing.title }}</strong>
          <button class="modal-close" @click="closeEditor">×</button>
        </div>

        <div class="plan-field">
          <label class="plan-label">时间段（也可直接拖动计划块上下边缘）</label>
          <div class="plan-range">
            <select v-model.number="editStart">
              <option v-for="m in startOptions" :key="'s' + m" :value="m">
                {{ fmtMin(m) }}
              </option>
            </select>
            <span>至</span>
            <select v-model.number="editEnd">
              <option v-for="m in endOptions" :key="'e' + m" :value="m">
                {{ fmtMin(m) }}
              </option>
            </select>
            <button class="plan-mini-btn" @click="saveRange">应用</button>
          </div>
        </div>

        <div class="plan-field">
          <label class="plan-label">
            完成百分比：{{ editProgress }}%
            <template v-if="editing.repeat && editing.repeat !== 'none'">（本次 {{ dateStr }}）</template>
          </label>
          <input
            v-model.number="editProgress"
            class="plan-slider"
            type="range"
            min="0"
            max="100"
            step="5"
          />
          <div class="plan-quick">
            <button
              v-for="p in quickPercents"
              :key="p"
              class="plan-mini-btn"
              :class="{ active: editProgress === p }"
              @click="editProgress = p"
            >
              {{ p }}%
            </button>
          </div>
        </div>

        <div class="plan-field">
          <label class="plan-label">循环</label>
          <div class="plan-range">
            <select v-model="editRepeat">
              <option v-for="o in REPEAT_OPTIONS" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
            <button class="plan-mini-btn" @click="saveRepeat">应用循环设置</button>
          </div>
          <span class="plan-field-tip">
            循环任务按规则在对应日期的时间段重复出现，每天的完成/反馈互不影响
          </span>
        </div>

        <div class="plan-field">
          <label class="plan-label">
            🍅 番茄工作法：已完成 {{ pomoOf(editing).done }} 个 · 打断
            {{ pomoOf(editing).interrupted }} 次
          </label>
          <div class="plan-range">
            <button
              class="plan-mini-btn"
              :disabled="blockDone(editing)"
              title="开始一个番茄（时长可在「设置 → 番茄」中调整）"
              @click="doPomodoro"
            >
              🍅 开始番茄
            </button>
          </div>
          <span v-if="pomoOf(editing).lastReason" class="plan-field-tip">
            最近一次打断原因：{{ pomoOf(editing).lastReason }}
          </span>
        </div>

        <div class="plan-actions">
          <button class="plan-btn primary" @click="saveProgress">保存进度</button>
          <template v-if="editing.repeat && editing.repeat !== 'none'">
            <button
              v-if="!blockDone(editing)"
              class="plan-btn success"
              @click="doComplete"
            >
              ✓ 完结（本次）
            </button>
            <button v-else class="plan-btn success" @click="doUndoComplete">
              ↩ 撤销本日完成
            </button>
          </template>
          <button
            v-else
            class="plan-btn success"
            @click="doComplete"
          >
            ✓ 直接完结
          </button>
          <button class="plan-btn ghost" @click="doEditTask">编辑任务</button>
          <button class="plan-btn danger" @click="doRemovePlan">
            {{ editing.repeat && editing.repeat !== 'none' ? '停止循环并移出' : '移出计划' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
