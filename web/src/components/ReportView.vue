<script setup lang="ts">
import { ref } from 'vue';
import { generateReport, type ReportType } from '../api';

const TYPES: { key: ReportType; label: string }[] = [
  { key: 'daily', label: '日报' },
  { key: 'weekly', label: '周报' },
  { key: 'monthly', label: '月报' },
];

const type = ref<ReportType>('daily');
const loading = ref(false);
const report = ref('');
const error = ref('');
const meta = ref<{ doneCount: number; planCount: number; periodLabel: string } | null>(null);
const copied = ref(false);

async function gen() {
  loading.value = true;
  error.value = '';
  report.value = '';
  meta.value = null;
  try {
    const res = await generateReport(type.value);
    report.value = res.report;
    meta.value = res.meta;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '生成失败';
  } finally {
    loading.value = false;
  }
}

function selectType(t: ReportType) {
  type.value = t;
  report.value = '';
  error.value = '';
  meta.value = null;
}

async function copyReport() {
  if (!report.value) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(report.value);
    } else {
      const ta = document.createElement('textarea');
      ta.value = report.value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    /* 忽略复制失败 */
  }
}
</script>

<template>
  <div class="report-view">
    <div class="report-head">
      <div class="sub-tabs">
        <button
          v-for="t in TYPES"
          :key="t.key"
          class="sub-tab"
          :class="{ active: type === t.key }"
          @click="selectType(t.key)"
        >
          {{ t.label }}
        </button>
      </div>
      <button class="primary-btn" :disabled="loading" @click="gen">
        {{ loading ? '生成中…' : '生成报告' }}
      </button>
    </div>

    <p class="report-hint">
      报告依据「上一周期已完成任务」+「本周期计划」自动生成；首次使用请先到右上角「设置 → 大模型」填写 API Key（OpenAI 兼容接口，如 DeepSeek）。报告风格可在「设置 → 报告风格 Skill」中自定义。
    </p>

    <div v-if="loading" class="loading-wrap">
      <div class="spinner"></div>
      <span>大模型正在生成，通常需要十几秒…</span>
    </div>

    <div v-else-if="error" class="report-error">{{ error }}</div>

    <div v-else-if="report" class="report-card">
      <div class="report-meta">
        依据：上一周期完成 {{ meta?.doneCount ?? 0 }} 项 · 本周期计划
        {{ meta?.planCount ?? 0 }} 项（{{ meta?.periodLabel }}）
      </div>
      <div class="report-body">{{ report }}</div>
      <button class="copy-btn" @click="copyReport">{{ copied ? '已复制 ✓' : '复制报告' }}</button>
    </div>

    <div v-else class="report-empty">
      选择「日报 / 周报 / 月报」后点击「生成报告」
    </div>
  </div>
</template>
