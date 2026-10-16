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
  type TaskPatch,
} from './api';
import QuadrantView from './components/QuadrantView.vue';
import ListView from './components/ListView.vue';
import ArchiveView from './components/ArchiveView.vue';
import DailyPlanView from './components/DailyPlanView.vue';
import TaskDialog from './components/TaskDialog.vue';
import SettingsDialog from './components/SettingsDialog.vue';

type TabKey = 'quadrant' | 'list' | 'archive' | 'plan';

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

// ---------- 响应式布局：≥900px 显示右侧每日计划栏，窄屏用「计划」标签页 ----------
const wide = ref(false);
function updateWide() {
  wide.value = window.innerWidth >= 900;
}

onMounted(() => {
  checkHealth();
  reload();
  healthTimer = setInterval(checkHealth, 15000);
  updateWide();
  window.addEventListener('resize', updateWide);
});

onUnmounted(() => {
  if (healthTimer) clearInterval(healthTimer);
  window.removeEventListener('resize', updateWide);
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

// ---------- 四象限拖拽移动（跨象限 + 象限内排序；从计划拖回时清除计划） ----------
async function handleMove(id: string, quadrant: QuadrantKey, order: number, clearPlan: boolean) {
  try {
    const patch: TaskPatch = { quadrant, order };
    if (clearPlan) patch.planDate = null;
    await updateTask(id, patch);
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '移动失败');
  }
}

// ---------- 每日计划操作 ----------
async function planSchedule(taskId: string, planDate: string, start: number, end: number) {
  try {
    await updateTask(taskId, { planDate, planStart: start, planEnd: end });
    notify('已加入每日计划');
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '安排计划失败');
  }
}

async function planMoveBlock(taskId: string, planDate: string, start: number, end: number) {
  try {
    const t = tasks.value.find((x) => x.id === taskId);
    // 循环任务移动只改时间段，保持基准日不变
    const patch: TaskPatch = t && t.repeat && t.repeat !== 'none'
      ? { planStart: start, planEnd: end }
      : { planDate, planStart: start, planEnd: end };
    await updateTask(taskId, patch);
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '调整时间段失败');
  }
}

async function planMoveBlocks(moves: { id: string; start: number; end: number }[]) {
  try {
    for (const mv of moves) {
      const t = tasks.value.find((x) => x.id === mv.id);
      const patch: TaskPatch = t && t.repeat && t.repeat !== 'none'
        ? { planStart: mv.start, planEnd: mv.end }
        : { planStart: mv.start, planEnd: mv.end };
      await updateTask(mv.id, patch);
    }
    notify(`已整体调整 ${moves.length} 个任务`);
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '批量调整失败');
  }
}

async function planSetProgress(taskId: string, progress: number | null) {
  try {
    await updateTask(taskId, { planProgress: progress });
    notify('进度已保存');
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '保存进度失败');
  }
}

async function planSetRepeat(taskId: string, repeat: string) {
  try {
    await updateTask(taskId, { repeat });
    notify(repeat === 'none' ? '已取消循环' : '循环设置已保存');
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '循环设置失败');
  }
}

async function planOccProgress(taskId: string, date: string, progress: number | null) {
  try {
    await updateTask(taskId, { occurrenceDate: date, occurrenceProgress: progress });
    notify('本次进度已保存');
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '保存进度失败');
  }
}

async function planOccComplete(taskId: string, date: string, done: boolean) {
  try {
    await updateTask(taskId, { occurrenceDate: date, occurrenceCompleted: done });
    notify(done ? '本次已完成 ✓' : '已撤销本次完成');
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '操作失败');
  }
}

async function planStopRepeat(taskId: string) {
  try {
    await updateTask(taskId, { repeat: 'none', planDate: null });
    notify('已停止循环并移出计划');
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '操作失败');
  }
}

async function planComplete(taskId: string) {
  try {
    await updateTask(taskId, { completed: true });
    notify('任务已完结并归档');
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '操作失败');
  }
}

async function planRemove(taskId: string) {
  try {
    await updateTask(taskId, { planDate: null });
    notify('已移出计划');
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '操作失败');
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
          <button
            v-if="!wide"
            class="tab"
            :class="{ active: tab === 'plan' }"
            @click="tab = 'plan'"
          >
            计划
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

    <div class="app-body">
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
        <ArchiveView v-else-if="tab === 'archive'" @changed="reload" />
        <DailyPlanView
          v-else
          :tasks="tasks"
          @schedule="planSchedule"
          @move-block="planMoveBlock"
          @move-blocks="planMoveBlocks"
          @set-progress="planSetProgress"
          @complete="planComplete"
          @remove-plan="planRemove"
          @edit="openEdit"
          @set-repeat="planSetRepeat"
          @occ-progress="planOccProgress"
          @occ-complete="planOccComplete"
          @stop-repeat="planStopRepeat"
        />
      </main>

      <aside v-if="wide" class="plan-side">
        <DailyPlanView
          :tasks="tasks"
          @schedule="planSchedule"
          @move-block="planMoveBlock"
          @move-blocks="planMoveBlocks"
          @set-progress="planSetProgress"
          @complete="planComplete"
          @remove-plan="planRemove"
          @edit="openEdit"
          @set-repeat="planSetRepeat"
          @occ-progress="planOccProgress"
          @occ-complete="planOccComplete"
          @stop-repeat="planStopRepeat"
        />
      </aside>
    </div>

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
