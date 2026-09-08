<script setup lang="ts">
import { computed } from 'vue';
import type { Task } from '../types';
import { quadrantOf } from '../types';
import { formatDisplayTime, isOverdue, isToday } from '../time';

const props = defineProps<{
  tasks: Task[];
  loading: boolean;
}>();

const emit = defineEmits<{
  toggle: [task: Task];
  edit: [task: Task];
  add: [];
}>();

interface Group {
  label: string;
  items: Task[];
}

const groups = computed<Group[]>(() => {
  const overdue: Task[] = [];
  const today: Task[] = [];
  const future: Task[] = [];
  const none: Task[] = [];

  for (const t of props.tasks) {
    if (t.completed) continue;
    if (!t.dueAt) none.push(t);
    else if (isOverdue(t.dueAt)) overdue.push(t);
    else if (isToday(t.dueAt)) today.push(t);
    else future.push(t);
  }

  return [
    { label: '已逾期', items: overdue },
    { label: '今天', items: today },
    { label: '未来', items: future },
    { label: '无日期', items: none },
  ];
});

const isEmpty = computed(() => groups.value.every((g) => g.items.length === 0));
</script>

<template>
  <div class="list-view">
    <div class="list-toolbar">
      <button class="primary-btn" @click="emit('add')">+ 新建任务</button>
    </div>

    <div v-if="loading && tasks.length === 0" class="loading-wrap">
      <div class="spinner"></div>
      <span>加载中…</span>
    </div>

    <div v-else-if="isEmpty" class="list-card">
      <div class="empty">
        <span class="empty-icon">🗒️</span>
        <span class="empty-text">暂无未完成任务</span>
        <span class="empty-hint">点击右上角「新建任务」开始安排</span>
      </div>
    </div>

    <div v-else class="list-card">
      <template v-for="group in groups" :key="group.label">
        <h3 v-if="group.items.length" class="group-head">{{ group.label }}</h3>
        <ul v-if="group.items.length">
          <li v-for="t in group.items" :key="t.id" class="task-row">
            <label class="checkbox" title="标记完成">
              <input
                type="checkbox"
                :checked="t.completed"
                @change="emit('toggle', t)"
              />
              <span class="checkbox-box"></span>
            </label>
            <span class="task-title" @click="emit('edit', t)">{{ t.title }}</span>
            <div class="task-meta">
              <span
                class="qtag"
                :style="{
                  color: quadrantOf(t.quadrant).color,
                  borderColor: quadrantOf(t.quadrant).color,
                  background: quadrantOf(t.quadrant).color + '14',
                }"
              >
                {{ quadrantOf(t.quadrant).label }}
              </span>
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
            </div>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
