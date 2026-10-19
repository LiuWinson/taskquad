<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { fmtCountdown } from '../time';

const props = defineProps<{
  long: boolean;
  totalMin: number;
  startedAt: number;
  taskTitle: string;
}>();

const emit = defineEmits<{
  skip: [];
  next: [];
  ended: [];
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

const remainMs = computed(() =>
  Math.max(0, props.startedAt + props.totalMin * 60000 - now.value),
);
const progressPct = computed(() => {
  const total = props.totalMin * 60000;
  if (total <= 0) return 100;
  return Math.min(100, ((total - remainMs.value) / total) * 100);
});

let endedFired = false;
watch(remainMs, (v) => {
  if (v <= 0 && !endedFired) {
    endedFired = true;
    emit('ended');
  }
});
</script>

<template>
  <div class="pomo-bar pomo-break" :class="{ 'pomo-long-break': long }">
    <span class="pomo-icon">{{ long ? '☕' : '🍵' }}</span>
    <span class="pomo-label">{{ long ? '大休息' : '短休息' }}</span>
    <span class="pomo-task">{{ taskTitle }} · {{ long ? '好好放松一下' : '喝口水活动一下' }}</span>
    <span class="pomo-time">{{ fmtCountdown(remainMs) }}</span>
    <span class="pomo-total">/ {{ totalMin }} 分钟</span>
    <div class="pomo-progress">
      <div class="pomo-progress-fill" :style="{ width: progressPct + '%' }"></div>
    </div>
    <button class="pomo-btn done" @click="emit('next')">开始下一个番茄</button>
    <button class="pomo-btn" @click="emit('skip')">跳过休息</button>
  </div>
</template>
