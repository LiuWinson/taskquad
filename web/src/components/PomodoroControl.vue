<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Task, PomodoroRecord } from '../types';
import { fmtCountdown } from '../time';

const props = defineProps<{
  task: Task;
  record: PomodoroRecord;
}>();

const emit = defineEmits<{
  complete: [];
  interrupt: [reason: string];
}>();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const totalMs = computed(() => props.record.plannedMin * 60000);
const remainMs = computed(() => {
  const start = new Date(props.record.startAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, start + totalMs.value - now.value);
});
const progressPct = computed(() => {
  if (totalMs.value <= 0) return 0;
  return Math.min(100, ((totalMs.value - remainMs.value) / totalMs.value) * 100);
});

const showInterrupt = ref(false);
const reason = ref('');

function openInterrupt() {
  reason.value = '';
  showInterrupt.value = true;
}
function confirmInterrupt() {
  const r = reason.value.trim();
  if (!r) return;
  emit('interrupt', r);
  showInterrupt.value = false;
  reason.value = '';
}
</script>

<template>
  <div class="pomo-bar">
    <span class="pomo-icon">🍅</span>
    <span class="pomo-label">番茄进行中</span>
    <span class="pomo-task" :title="task.title">{{ task.title }}</span>
    <span class="pomo-time">{{ fmtCountdown(remainMs) }}</span>
    <span class="pomo-total">/ {{ record.plannedMin }} 分钟</span>
    <div class="pomo-progress">
      <div class="pomo-progress-fill" :style="{ width: progressPct + '%' }"></div>
    </div>
    <button class="pomo-btn done" @click="emit('complete')">完成番茄</button>
    <button class="pomo-btn stop" @click="openInterrupt">打断</button>
  </div>

  <div v-if="showInterrupt" class="pomo-overlay" @click.self="showInterrupt = false">
    <div class="pomo-pop">
      <h3 class="pomo-pop-title">打断番茄</h3>
      <p class="pomo-hint">
        请写清打断原因（必填）。恢复后重新开始会开启一个新的番茄，本番茄将记为「已打断」。
      </p>
      <textarea
        v-model="reason"
        class="pomo-textarea"
        placeholder="例如：被临时叫去开会 / 处理紧急电话 / 帮同事改 bug"
      ></textarea>
      <div class="pomo-actions">
        <button class="pomo-btn" @click="showInterrupt = false">取消</button>
        <button class="pomo-btn stop" :disabled="!reason.trim()" @click="confirmInterrupt">
          确认打断
        </button>
      </div>
    </div>
  </div>
</template>
