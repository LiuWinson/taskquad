<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, provide } from 'vue';
import type { Task, QuadrantKey } from './types';
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getHealth,
  startPomodoro,
  completePomodoro,
  interruptPomodoro,
  getPomodoroConfig,
  type TaskPayload,
  type TaskPatch,
} from './api';
import QuadrantView from './components/QuadrantView.vue';
import ListView from './components/ListView.vue';
import ArchiveView from './components/ArchiveView.vue';
import DailyPlanView from './components/DailyPlanView.vue';
import TaskDialog from './components/TaskDialog.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import PomodoroControl from './components/PomodoroControl.vue';
import BreakBar from './components/BreakBar.vue';
import ReportView from './components/ReportView.vue';
import { useBackdropClose } from './backdrop';

type TabKey = 'quadrant' | 'list' | 'archive' | 'plan' | 'report';

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
  syncDay();
}

// ---------- "今天"跨天检测：托盘常驻数天后打开窗口，自动跟随到最新今天 ----------
const todayKey = ref(localDateStr());

function localDateStr(d: Date = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function syncDay() {
  const t = localDateStr();
  if (t !== todayKey.value) {
    todayKey.value = t;
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
  loadPomoConfig();
  healthTimer = setInterval(checkHealth, 15000);
  updateWide();
  window.addEventListener('resize', updateWide);
  // 窗口获得焦点 / 从托盘恢复显示 / 标签页重新可见时立即校准今天
  window.addEventListener('focus', syncDay);
  document.addEventListener('visibilitychange', syncDay);
  if (window.desktop && typeof window.desktop.onWindowShown === 'function') {
    window.desktop.onWindowShown(syncDay);
  }
});

onUnmounted(() => {
  if (healthTimer) clearInterval(healthTimer);
  window.removeEventListener('resize', updateWide);
  window.removeEventListener('focus', syncDay);
  document.removeEventListener('visibilitychange', syncDay);
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

// ---------- 番茄工作法 ----------
const activePomodoro = computed(() => {
  for (const t of tasks.value) {
    const rec = (t.pomodoros || []).find((p) => p.status === 'running');
    if (rec) return { task: t, record: rec };
  }
  return null;
});

// 番茄时长配置
const pomoConfig = ref<{ workMin: number; breakMin: number; longBreakMin: number; longBreakEvery: number }>({
  workMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  longBreakEvery: 4,
});

async function loadPomoConfig() {
  try {
    const cfg = await getPomodoroConfig();
    pomoConfig.value = {
      workMin: cfg.workMin,
      breakMin: cfg.breakMin,
      longBreakMin: cfg.longBreakMin,
      longBreakEvery: cfg.longBreakEvery,
    };
  } catch {
    /* 保持默认值 */
  }
}

// 休息阶段（短休息 / 大休息）
const breakState = ref<{
  long: boolean;
  totalMin: number;
  startedAt: number;
  taskTitle: string;
  taskId: string;
} | null>(null);

// 休息结束弹窗
const breakDone = ref<{ long: boolean; totalMin: number; taskTitle: string; taskId: string } | null>(
  null,
);
const breakDoneBackdrop = useBackdropClose(() => {
  breakDone.value = null;
});

/** 今日已完成的番茄数（用于判断是否该长休息） */
function completedPomodorosToday(): number {
  const today = todayKey.value;
  let count = 0;
  for (const t of tasks.value) {
    for (const p of t.pomodoros || []) {
      if (p.status !== 'completed' || !p.startAt) continue;
      const d = new Date(p.startAt);
      const ds = localDateStr(d);
      if (ds === today) count += 1;
    }
  }
  return count;
}

function startBreak(taskTitle: string, taskId: string) {
  if (!pomoConfig.value) return;
  const doneToday = completedPomodorosToday();
  const isLong = pomoConfig.value.longBreakEvery > 0 && doneToday > 0 &&
    doneToday % pomoConfig.value.longBreakEvery === 0;
  breakState.value = {
    long: isLong,
    totalMin: isLong ? pomoConfig.value.longBreakMin : pomoConfig.value.breakMin,
    startedAt: Date.now(),
    taskTitle,
    taskId,
  };
}

async function handleStartPomodoro(taskId: string, minutes?: number) {
  breakState.value = null; // 开始工作即结束休息阶段
  try {
    await startPomodoro(taskId, minutes);
    notify('番茄已开始 🍅');
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '开始番茄失败');
  }
}

async function handleCompletePomodoro() {
  const cur = activePomodoro.value;
  if (!cur) return;
  handledPomoIds.add(cur.record.id);
  try {
    await completePomodoro(cur.task.id);
    await reload();
    startBreak(cur.task.title, cur.task.id);
    notify('番茄完成 🍅 进入休息');
  } catch (e) {
    notify(e instanceof Error ? e.message : '操作失败');
  }
}

async function handleInterruptPomodoro(reason: string) {
  const cur = activePomodoro.value;
  if (!cur) return;
  handledPomoIds.add(cur.record.id);
  try {
    await interruptPomodoro(cur.task.id, reason);
    notify('已打断，原因已记录');
    await reload();
  } catch (e) {
    notify(e instanceof Error ? e.message : '操作失败');
  }
}

// ---------- 番茄到点弹窗（工作时间内到点主动完结并弹窗，不依赖服务端轮询） ----------
const handledPomoIds = new Set<string>();
const pomoDone = ref<{ taskTitle: string; taskId: string; plannedMin: number } | null>(null);
const pomoDoneBackdrop = useBackdropClose(() => {
  pomoDone.value = null;
});
let pomoDeadlineTimer: ReturnType<typeof setTimeout> | null = null;

function clearPomoDeadline() {
  if (pomoDeadlineTimer) {
    clearTimeout(pomoDeadlineTimer);
    pomoDeadlineTimer = null;
  }
}

function schedulePomoDeadline() {
  clearPomoDeadline();
  const cur = activePomodoro.value;
  if (!cur || handledPomoIds.has(cur.record.id)) return;
  const startMs = new Date(cur.record.startAt).getTime();
  const endMs = startMs + cur.record.plannedMin * 60000;
  const delay = Math.max(0, endMs - Date.now());
  pomoDeadlineTimer = setTimeout(() => {
    void firePomodoroDone(cur.task.id, cur.record.id);
  }, delay);
}

async function firePomodoroDone(taskId: string, recordId: string) {
  if (handledPomoIds.has(recordId)) return;
  handledPomoIds.add(recordId);
  const task = tasks.value.find((t) => t.id === taskId);
  const plannedMin =
    (task?.pomodoros || []).find((p) => p.id === recordId)?.plannedMin ?? pomoConfig.value.workMin;
  try {
    await completePomodoro(taskId);
  } catch {
    /* 服务端可能已自动完结，忽略 */
  }
  await reload();
  pomoDone.value = {
    taskTitle: task?.title ?? '当前任务',
    taskId,
    plannedMin,
  };
}

function startBreakFromDone() {
  const d = pomoDone.value;
  pomoDone.value = null;
  if (d) startBreak(d.taskTitle, d.taskId);
}

function startNextFromDone() {
  const d = pomoDone.value;
  pomoDone.value = null;
  if (d) handleStartPomodoro(d.taskId);
}

// 每当有进行中番茄（或它结束）时重新计算到点定时器
watch(
  activePomodoro,
  () => {
    schedulePomoDeadline();
  },
  { immediate: true },
);

function handleBreakEnded() {
  const cur = breakState.value;
  if (!cur) return;
  breakState.value = null;
  breakDone.value = {
    long: cur.long,
    totalMin: cur.totalMin,
    taskTitle: cur.taskTitle,
    taskId: cur.taskId,
  };
}

function startNextFromBreakDone() {
  const d = breakDone.value;
  breakDone.value = null;
  if (d) handleStartPomodoro(d.taskId);
}

function handleBreakNext() {
  const cur = breakState.value;
  breakState.value = null;
  if (cur) handleStartPomodoro(cur.taskId);
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
          <button
            class="tab"
            :class="{ active: tab === 'report' }"
            @click="tab = 'report'"
          >
            报告
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

    <PomodoroControl
      v-if="activePomodoro"
      :task="activePomodoro.task"
      :record="activePomodoro.record"
      @complete="handleCompletePomodoro"
      @interrupt="handleInterruptPomodoro"
    />

    <BreakBar
      v-if="breakState && !activePomodoro"
      :long="breakState.long"
      :total-min="breakState.totalMin"
      :started-at="breakState.startedAt"
      :task-title="breakState.taskTitle"
      @skip="breakState = null"
      @next="handleBreakNext"
      @ended="handleBreakEnded"
    />

    <div
      v-if="pomoDone"
      class="pomo-overlay"
      @mousedown="pomoDoneBackdrop.onBackdropDown"
      @mouseup="pomoDoneBackdrop.onBackdropUp"
    >
      <div class="pomo-pop pomo-done-pop">
        <div class="pomo-done-icon">🍅</div>
        <h3 class="pomo-pop-title">番茄时间到！</h3>
        <p class="pomo-hint">
          「{{ pomoDone.taskTitle }}」已完成一个 {{ pomoDone.plannedMin }} 分钟的番茄。
          休息一下，再开始下一个？
        </p>
        <div class="pomo-actions">
          <button class="pomo-btn" @click="pomoDone = null">关闭</button>
          <button class="pomo-btn stop" @click="startNextFromDone">开始下一个番茄</button>
          <button class="pomo-btn done" @click="startBreakFromDone">开始休息</button>
        </div>
      </div>
    </div>

    <div
      v-if="breakDone"
      class="pomo-overlay"
      @mousedown="breakDoneBackdrop.onBackdropDown"
      @mouseup="breakDoneBackdrop.onBackdropUp"
    >
      <div class="pomo-pop pomo-done-pop">
        <div class="pomo-done-icon">{{ breakDone.long ? '☕' : '🍵' }}</div>
        <h3 class="pomo-pop-title">{{ breakDone.long ? '大休息结束' : '短休息结束' }}</h3>
        <p class="pomo-hint">
          已经休息了 {{ breakDone.totalMin }} 分钟。准备好开始下一个番茄了吗？
          <br />
          <span class="pomo-done-sub">下一个番茄仍属于「{{ breakDone.taskTitle }}」</span>
        </p>
        <div class="pomo-actions">
          <button class="pomo-btn" @click="breakDone = null">关闭</button>
          <button class="pomo-btn done" @click="startNextFromBreakDone">开始下一个番茄</button>
        </div>
      </div>
    </div>

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
        <ReportView v-else-if="tab === 'report'" />
        <DailyPlanView
          v-else
          :tasks="tasks"
          :today-key="todayKey"
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
          @pomodoro="handleStartPomodoro"
        />
      </main>

      <aside v-if="wide" class="plan-side">
        <DailyPlanView
          :tasks="tasks"
          :today-key="todayKey"
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
          @pomodoro="handleStartPomodoro"
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
      @pomodoro="dialogTask ? handleStartPomodoro(dialogTask.id) : null"
    />

    <SettingsDialog
      v-if="settingsOpen"
      :connected="connected"
      @close="settingsOpen = false"
      @pomodoro-saved="loadPomoConfig"
    />

    <transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>
