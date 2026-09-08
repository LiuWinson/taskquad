<script setup lang="ts">
import { ref, computed, inject, onMounted, watch } from 'vue';
import {
  getArchive,
  updateTask,
  deleteTask,
  type ArchivePeriod,
  type ArchiveResponse,
} from '../api';
import type { Task } from '../types';
import { quadrantOf } from '../types';
import { formatMonthDay, formatTime } from '../time';

const emit = defineEmits<{
  changed: [];
}>();

const notify = inject<(message: string) => void>('notify', () => {});

const PERIODS: { key: ArchivePeriod; label: string }[] = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'quarter', label: '本季度' },
];

const period = ref<ArchivePeriod>('week');
const archive = ref<ArchiveResponse | null>(null);
const loading = ref(false);

const tasks = computed(() => archive.value?.tasks ?? []);
const periodLabel = computed(
  () => PERIODS.find((p) => p.key === period.value)?.label ?? '本周',
);

interface ArchiveGroup {
  label: string;
  items: Task[];
}

const groups = computed<ArchiveGroup[]>(() => {
  const map = new Map<string, Task[]>();
  for (const t of tasks.value) {
    const key = formatMonthDay(t.completedAt) || '未知日期';
    const arr = map.get(key) ?? [];
    arr.push(t);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
});

async function load() {
  loading.value = true;
  try {
    archive.value = await getArchive(period.value);
  } catch (e) {
    notify(e instanceof Error ? e.message : '加载归档失败');
  } finally {
    loading.value = false;
  }
}

async function restore(t: Task) {
  try {
    await updateTask(t.id, { completed: false });
    notify('任务已恢复');
    emit('changed');
    await load();
  } catch (e) {
    notify(e instanceof Error ? e.message : '恢复失败');
  }
}

async function remove(t: Task) {
  try {
    await deleteTask(t.id);
    notify('任务已删除');
    emit('changed');
    await load();
  } catch (e) {
    notify(e instanceof Error ? e.message : '删除失败');
  }
}

function selectPeriod(key: ArchivePeriod) {
  if (period.value === key) return;
  period.value = key;
}

watch(period, load);
onMounted(load);
</script>

<template>
  <div class="archive-view">
    <div class="sub-tabs">
      <button
        v-for="p in PERIODS"
        :key="p.key"
        class="sub-tab"
        :class="{ active: period === p.key }"
        @click="selectPeriod(p.key)"
      >
        {{ p.label }}
      </button>
    </div>

    <div class="archive-summary">
      {{ periodLabel }}已完成
      <strong>{{ tasks.length }}</strong> 项
    </div>

    <div v-if="loading && !archive" class="loading-wrap">
      <div class="spinner"></div>
      <span>加载中…</span>
    </div>

    <div v-else-if="tasks.length === 0" class="list-card">
      <div class="empty">
        <span class="empty-icon">📦</span>
        <span class="empty-text">{{ periodLabel }}暂无已完成任务</span>
      </div>
    </div>

    <div v-else class="list-card">
      <template v-for="group in groups" :key="group.label">
        <h3 class="group-head">{{ group.label }}</h3>
        <ul>
          <li v-for="t in group.items" :key="t.id" class="archive-row">
            <span class="archive-title">{{ t.title }}</span>
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
            <span class="archive-time">{{ formatTime(t.completedAt) }}</span>
            <div class="row-actions">
              <button class="mini-btn" @click="restore(t)">恢复</button>
              <button class="mini-btn danger" @click="remove(t)">删除</button>
            </div>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
