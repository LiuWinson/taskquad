<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Task } from '../types';
import { quadrantOf } from '../types';

const props = defineProps<{
  tasks: Task[];
}>();

const emit = defineEmits<{
  schedule: [taskId: string, planDate: string, start: number, end: number];
  moveBlock: [taskId: string, planDate: string, start: number, end: number];
  setProgress: [taskId: string, progress: number | null];
  complete: [taskId: string];
  removePlan: [taskId: string];
  edit: [task: Task];
}>();

const SLOT_H = 28; // 每个半小时槽位像素高度
const DRAG_TYPE = 'application/x-taskquad';

// ---------- 日期 ----------
function fmtDate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayStr(): string {
  return fmtDate(new Date());
}
const dateStr = ref(todayStr());

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
        t.planDate === dateStr.value &&
        typeof t.planStart === 'number' &&
        typeof t.planEnd === 'number',
    )
    .sort((a, b) => (a.planStart! - b.planStart!) || a.order - b.order),
);

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
  return (
    isToday.value &&
    !t.completed &&
    t.planProgress == null &&
    typeof t.planEnd === 'number' &&
    t.planEnd <= nowMin.value
  );
}

// ---------- 拖拽：四象限任务 → 计划槽位；计划块 → 其他槽位/四象限 ----------
const dragKind = ref<'quadrant' | 'plan' | null>(null);
const dragTaskId = ref<string | null>(null);
const dragDuration = ref<number>(30);
const hoverSlot = ref<number | null>(null);

function readDrag(e: DragEvent) {
  const dt = e.dataTransfer;
  if (!dt) return null;
  if (!dt.types.includes(DRAG_TYPE)) return null;
  const kind = dt.getData(DRAG_TYPE) as 'quadrant' | 'plan';
  if (kind !== 'quadrant' && kind !== 'plan') return null;
  const id = dt.getData('text/plain');
  if (!id) return null;
  return { kind, id };
}

function onBlockDragStart(e: DragEvent, t: Task) {
  const dt = e.dataTransfer;
  if (!dt) return;
  dragKind.value = 'plan';
  dragTaskId.value = t.id;
  dragDuration.value = (t.planEnd! - t.planStart!) || 30;
  dt.effectAllowed = 'move';
  dt.setData(DRAG_TYPE, 'plan');
  dt.setData('text/plain', t.id);
}

function onSlotDragOver(e: DragEvent, startMin: number) {
  const drag = readDrag(e);
  if (!drag) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  hoverSlot.value = startMin;
}

function onSlotDrop(e: DragEvent, startMin: number) {
  const drag = readDrag(e);
  if (!drag) return;
  e.preventDefault();
  const endMin = drag.kind === 'plan' ? startMin + dragDuration.value : startMin + 30;
  if (drag.kind === 'plan') {
    // 计划块移动：先冲突检测（排除自身）
    for (let m = startMin; m < endMin; m += 30) {
      const hit = blockCovering(m, drag.id);
      if (hit && hit.id !== drag.id) {
        window.alert(`该时间段与「${hit.title}」冲突`);
        clearDrag();
        return;
      }
    }
    emit('moveBlock', drag.id, dateStr.value, startMin, endMin);
  } else {
    // 四象限任务 → 计划：冲突检测
    for (let m = startMin; m < endMin; m += 30) {
      const hit = blockCovering(m);
      if (hit) {
        window.alert(`该时间段与「${hit.title}」冲突`);
        clearDrag();
        return;
      }
    }
    emit('schedule', drag.id, dateStr.value, startMin, endMin);
  }
  clearDrag();
}

function clearDrag() {
  dragKind.value = null;
  dragTaskId.value = null;
  hoverSlot.value = null;
}

onMounted(() => window.addEventListener('dragend', clearDrag));
onUnmounted(() => window.removeEventListener('dragend', clearDrag));

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

function openEditor(t: Task) {
  editing.value = t;
  editStart.value = t.planStart ?? 0;
  editEnd.value = t.planEnd ?? (t.planStart ?? 0) + 30;
  editProgress.value = t.planProgress ?? 50;
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
  emit('setProgress', editing.value.id, editProgress.value);
  closeEditor();
}
function doComplete() {
  if (!editing.value) return;
  emit('complete', editing.value.id);
  closeEditor();
}
function doRemovePlan() {
  if (!editing.value) return;
  emit('removePlan', editing.value.id);
  closeEditor();
}
function doEditTask() {
  if (!editing.value) return;
  emit('edit', editing.value);
  closeEditor();
}

// 时间选择项（半小时粒度）
const startOptions = Array.from({ length: 48 }, (_, i) => i * 30);
const endOptions = Array.from({ length: 48 }, (_, i) => (i + 1) * 30);
const slotStarts = Array.from({ length: 48 }, (_, i) => i * 30);
const quickPercents = [25, 50, 75, 100];

function slotBlockStyle(t: Task) {
  const start = t.planStart ?? 0;
  const end = t.planEnd ?? start + 30;
  const dur = Math.max(30, end - start);
  return {
    top: `${(start / 30) * SLOT_H + 1}px`,
    height: `${(dur / 30) * SLOT_H - 2}px`,
    '--plan-color': quadrantOf(t.quadrant).color,
  };
}

function slotHovered(startMin: number): boolean {
  if (hoverSlot.value == null) return false;
  const drag = { kind: dragKind.value };
  const len = drag.kind === 'plan' ? dragDuration.value : 30;
  return startMin >= hoverSlot.value && startMin < hoverSlot.value + len;
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

    <div class="plan-hint">按住四象限里的任务拖到时间槽；点计划块可调整时间段与反馈进度</div>

    <div class="plan-scroll">
      <div class="plan-grid" :style="{ height: 48 * SLOT_H + 'px' }">
        <!-- 现在时间线 -->
        <div
          v-if="isToday"
          class="plan-now"
          :style="{ top: (nowMin / 30) * SLOT_H + 'px' }"
        ></div>

        <!-- 48 个半小时槽位 -->
        <div
          v-for="(m, i) in slotStarts"
          :key="m"
          class="plan-slot"
          :class="{
            'slot-hover': slotHovered(m),
            'slot-hour': m % 60 === 0,
          }"
          :style="{ top: i * SLOT_H + 'px' }"
          @dragover="onSlotDragOver($event, m)"
          @drop="onSlotDrop($event, m)"
          @click="pickSlot = m"
        >
          <span v-if="m % 60 === 0" class="slot-label">{{ fmtMin(m) }}</span>
        </div>

        <!-- 计划块 -->
        <div
          v-for="t in dayBlocks"
          :key="t.id"
          class="plan-block"
          :class="{ 'plan-pending': isPending(t) }"
          :style="slotBlockStyle(t)"
          draggable="true"
          @dragstart="onBlockDragStart($event, t)"
          @click.stop="openEditor(t)"
        >
          <span class="plan-block-title">{{ t.title }}</span>
          <span class="plan-block-meta">
            {{ fmtMin(t.planStart!) }}-{{ fmtMin(t.planEnd!) }}
            <template v-if="t.planProgress != null">
              · {{ t.planProgress }}%
            </template>
            <template v-else-if="isPending(t)"> · ⏰ 待反馈</template>
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
          <label class="plan-label">时间段</label>
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
          <label class="plan-label">完成百分比：{{ editProgress }}%</label>
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

        <div class="plan-actions">
          <button class="plan-btn primary" @click="saveProgress">保存进度</button>
          <button class="plan-btn success" @click="doComplete">✓ 直接完结</button>
          <button class="plan-btn ghost" @click="doEditTask">编辑任务</button>
          <button class="plan-btn danger" @click="doRemovePlan">移出计划</button>
        </div>
      </div>
    </div>
  </div>
</template>
