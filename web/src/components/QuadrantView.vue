<script setup lang="ts">
import { ref } from 'vue';
import { QUADRANTS, type QuadrantKey, type Task } from '../types';
import { formatDisplayTime, isOverdue } from '../time';

const props = defineProps<{
  tasks: Task[];
  loading: boolean;
}>();

const emit = defineEmits<{
  toggle: [task: Task];
  edit: [task: Task];
  add: [quadrant: QuadrantKey];
  move: [taskId: string, targetQuadrant: QuadrantKey, order: number];
}>();

/** 按服务端 order 排序（旧数据已由服务端归一化补齐） */
function tasksOf(key: QuadrantKey): Task[] {
  return props.tasks
    .filter((t) => t.quadrant === key && !t.completed)
    .sort(
      (a, b) =>
        a.order - b.order ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

// ---------- 拖拽状态 ----------
const dragId = ref<string | null>(null);
const dragOverQuadrant = ref<QuadrantKey | null>(null);
const dropIndex = ref<{ quadrant: QuadrantKey; index: number } | null>(null);

function onDragStart(e: DragEvent, t: Task) {
  dragId.value = t.id;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.id);
  }
}

function clearDrag() {
  dragId.value = null;
  dragOverQuadrant.value = null;
  dropIndex.value = null;
}

function onCardDragOver(e: DragEvent, q: QuadrantKey) {
  if (!dragId.value) return;
  e.preventDefault();
  dragOverQuadrant.value = q;
  dropIndex.value = null; // 悬停在卡片空白区 → 追加到末尾
}

function onCardDrop(e: DragEvent, q: QuadrantKey) {
  e.preventDefault();
  if (!dragId.value) return;
  commitMove(q, Number.POSITIVE_INFINITY);
}

function onRowDragOver(e: DragEvent, q: QuadrantKey, t: Task) {
  if (!dragId.value || dragId.value === t.id) return;
  e.preventDefault();
  e.stopPropagation();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  const list = tasksOf(q);
  const idx = list.findIndex((x) => x.id === t.id);
  if (idx >= 0) {
    dropIndex.value = { quadrant: q, index: before ? idx : idx + 1 };
  }
}

function onRowDrop(e: DragEvent) {
  e.preventDefault();
  e.stopPropagation();
  const drop = dropIndex.value;
  if (!dragId.value || !drop) return;
  commitMove(drop.quadrant, drop.index);
}

/** 计算目标位置对应的 order（相邻值中点，支持任意多次插入） */
function commitMove(target: QuadrantKey, rawIndex: number) {
  const id = dragId.value;
  if (!id) return;
  const origList = tasksOf(target);
  const origIdx = origList.findIndex((x) => x.id === id);
  const list = origList.filter((x) => x.id !== id);
  let index = rawIndex;
  if (origIdx >= 0 && index > origIdx) index -= 1; // 同象限内剔除自身后的位置修正

  let order: number;
  if (list.length === 0) {
    order = Date.now();
  } else if (index <= 0) {
    order = list[0].order - 1;
  } else if (index >= list.length) {
    order = list[list.length - 1].order + 1;
  } else {
    order = (list[index - 1].order + list[index].order) / 2;
  }
  emit('move', id, target, order);
  clearDrag();
}

/** 行插入指示线位置：before → 顶部线；after → 底部线 */
function rowIndicator(q: QuadrantKey, t: Task): 'before' | 'after' | null {
  const drop = dropIndex.value;
  if (!drop || drop.quadrant !== q) return null;
  const list = tasksOf(q);
  const idx = list.findIndex((x) => x.id === t.id);
  if (idx < 0) return null;
  if (drop.index === idx) return 'before';
  if (drop.index === idx + 1) return 'after';
  return null;
}
</script>

<template>
  <div v-if="loading && tasks.length === 0" class="loading-wrap">
    <div class="spinner"></div>
    <span>加载中…</span>
  </div>

  <div v-else class="quadrant-view">
    <p class="drag-hint">
      💡 按住任务拖动，可在同一象限内排序，也可拖到其他象限改变分类
    </p>
    <div class="quadrant-grid">
      <section
        v-for="q in QUADRANTS"
        :key="q.key"
        class="qcard"
        :class="{ 'drag-over': dragOverQuadrant === q.key && dragId }"
        :style="{ '--q-color': q.color }"
        @dragover="onCardDragOver($event, q.key)"
        @drop="onCardDrop($event, q.key)"
      >
        <div class="qcard-head">
          <span class="qcard-bar"></span>
          <h2 class="qcard-title">{{ q.label }}</h2>
          <span class="qcard-count">{{ tasksOf(q.key).length }} 项</span>
        </div>

        <ul class="qcard-list">
          <li v-if="tasksOf(q.key).length === 0" class="qcard-empty">
            暂无任务，把任务拖到这里
          </li>
          <li
            v-for="t in tasksOf(q.key)"
            :key="t.id"
            class="task-row"
            :class="[
              { dragging: dragId === t.id },
              { 'drop-before': rowIndicator(q.key, t) === 'before' },
              { 'drop-after': rowIndicator(q.key, t) === 'after' },
            ]"
            draggable="true"
            @dragstart="onDragStart($event, t)"
            @dragend="clearDrag"
            @dragover="onRowDragOver($event, q.key, t)"
            @drop="onRowDrop($event)"
          >
            <label class="checkbox" title="标记完成">
              <input
                type="checkbox"
                :checked="t.completed"
                @change="emit('toggle', t)"
              />
              <span class="checkbox-box"></span>
            </label>
            <span class="task-title" @click="emit('edit', t)">{{ t.title }}</span>
            <span
              v-if="t.dueAt"
              class="due-badge"
              :class="{ overdue: isOverdue(t.dueAt) }"
            >
              {{ formatDisplayTime(t.dueAt) }}
            </span>
            <span
              v-if="t.remindAt"
              class="bell"
              :title="`提醒：${formatDisplayTime(t.remindAt)}`"
              >🔔</span
            >
          </li>
        </ul>

        <button class="add-btn" @click="emit('add', q.key)">+ 添加任务</button>
      </section>
    </div>
  </div>
</template>
