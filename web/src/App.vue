<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide } from 'vue';
import type { Task, QuadrantKey } from './types';
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getHealth,
  type TaskPayload,
} from './api';
import QuadrantView from './components/QuadrantView.vue';
import ListView from './components/ListView.vue';
import ArchiveView from './components/ArchiveView.vue';
import TaskDialog from './components/TaskDialog.vue';
import SettingsDialog from './components/SettingsDialog.vue';

type TabKey = 'quadrant' | 'list' | 'archive';

const tab = ref<TabKey>('quadrant');
const tasks = ref<Task[]>([]);
const loading = ref(false);
const connected = ref(false);

// ---------- 全局 Toast（自实现：顶部浮动，2.5 秒消失） ----------
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function notify(message: string) {
  toast.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 2500);
}
provide('notify', notify);

// ---------- 任务数据 ----------
async function reload() {
  loading.value = true;
  try {
    const res = await getTasks();
    tasks.value = res.tasks;
  } catch (e) {
    notify(e instanceof Error ? e.message : '加载任务失败');
  } finally {
    loading.value = false;
  }
}

// ---------- 连接状态（每 15 秒 GET /api/health） ----------
let healthTimer: ReturnType<typeof setInterval> | null = null;

async function checkHealth() {
  try {
    await getHealth();
    connected.value = true;
  } catch {
    connected.value = false;
  }
}

onMounted(() => {
  checkHealth();
  reload();
  healthTimer = setInterval(checkHealth, 15000);
});

onUnmounted(() => {
  if (healthTimer) clearInterval(healthTimer);
});

// ---------- 新建/编辑对话框 ----------
const dialogOpen = ref(false);
const dialogTask = ref<Task | null>(null);
const dialogQuadrant = ref<QuadrantKey>('IU');

function openCreate(quadrant: QuadrantKey = 'IU') {
  dialogTask.value = null;
  dialogQuadrant.value = quadrant;
  dialogOpen.value = true;
}

function openEdit(task: Task) {
  dialogTask.value = task;
  dialogQuadrant.value = task.quadrant;
  dialogOpen.value = true;
}

function closeDialog() {
  dialogOpen.value = false;
}

async function handleSave(payload: TaskPayload) {
  try {
    if (dialogTask.value) {
      await updateTask(dialogTask.value.id, payload);
      notify('任务已更新');
    } else {
      await createTask(payload);
      notify('任务已创建');
    }
    dialogOpen.value = false;
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '保存失败');
  }
}

async function handleDeleteTask(id: string) {
  try {
    await deleteTask(id);
    notify('任务已删除');
    dialogOpen.value = false;
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '删除失败');
  }
}

// ---------- 勾选完成 ----------
async function handleToggle(task: Task) {
  try {
    await updateTask(task.id, { completed: !task.completed });
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '操作失败');
  }
}

// ---------- 四象限拖拽移动（跨象限 + 象限内排序） ----------
async function handleMove(id: string, quadrant: QuadrantKey, order: number) {
  try {
    await updateTask(id, { quadrant, order });
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '移动失败');
  }
}

// ---------- 设置对话框 ----------
const settingsOpen = ref(false);
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="topbar-left">
        <h1 class="app-title">任务四象限</h1>
        <nav class="tabs">
          <button
            class="tab"
            :class="{ active: tab === 'quadrant' }"
            @click="tab = 'quadrant'"
          >
            四象限
          </button>
          <button
            class="tab"
            :class="{ active: tab === 'list' }"
            @click="tab = 'list'"
          >
            列表
          </button>
          <button
            class="tab"
            :class="{ active: tab === 'archive' }"
            @click="tab = 'archive'"
          >
            归档
          </button>
        </nav>
      </div>
      <div class="topbar-right">
        <span class="conn" :class="connected ? 'conn-ok' : 'conn-err'">
          <span class="conn-dot"></span>
          {{ connected ? '已连接' : '未连接' }}
        </span>
        <button class="icon-btn" @click="settingsOpen = true">⚙ 设置</button>
      </div>
    </header>

    <main class="content">
      <QuadrantView
        v-if="tab === 'quadrant'"
        :tasks="tasks"
        :loading="loading"
        @toggle="handleToggle"
        @edit="openEdit"
        @add="openCreate"
        @move="handleMove"
      />
      <ListView
        v-else-if="tab === 'list'"
        :tasks="tasks"
        :loading="loading"
        @toggle="handleToggle"
        @edit="openEdit"
        @add="openCreate()"
      />
      <ArchiveView v-else @changed="reload" />
    </main>

    <TaskDialog
      v-if="dialogOpen"
      :task="dialogTask"
      :default-quadrant="dialogQuadrant"
      @close="closeDialog"
      @save="handleSave"
      @delete="handleDeleteTask"
    />

    <SettingsDialog
      v-if="settingsOpen"
      :connected="connected"
      @close="settingsOpen = false"
    />

    <transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>
