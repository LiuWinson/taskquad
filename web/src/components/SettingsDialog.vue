<script setup lang="ts">
import { ref, inject, onMounted } from 'vue';
import {
  getInfo,
  getLlmConfig,
  saveLlmConfig,
  testLlm,
  getPomodoroConfig,
  savePomodoroConfig,
  type InfoResponse,
} from '../api';

defineProps<{
  connected: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const notify = inject<(message: string) => void>('notify', () => {});

const info = ref<InfoResponse | null>(null);
const loading = ref(false);
const llmBaseUrl = ref('');
const llmModel = ref('');
const llmApiKey = ref('');
const llmHasKey = ref(false);
const llmTesting = ref(false);
const llmStatus = ref('');
const llmStatusOk = ref(false);
const pomoWork = ref(25);
const pomoBreak = ref(5);
const pomoLongBreak = ref(15);
const pomoLongEvery = ref(4);
const pomoSaving = ref(false);

async function load() {
  loading.value = true;
  try {
    info.value = await getInfo();
  } catch (e) {
    notify(e instanceof Error ? e.message : '获取服务器信息失败');
  } finally {
    loading.value = false;
  }
}

async function loadLlm() {
  try {
    const cfg = await getLlmConfig();
    llmBaseUrl.value = cfg.baseUrl;
    llmModel.value = cfg.model;
    llmHasKey.value = cfg.hasKey;
  } catch {
    /* 服务器未就绪时忽略 */
  }
}

async function loadPomodoro() {
  try {
    const cfg = await getPomodoroConfig();
    pomoWork.value = cfg.workMin;
    pomoBreak.value = cfg.breakMin;
    pomoLongBreak.value = cfg.longBreakMin;
    pomoLongEvery.value = cfg.longBreakEvery;
  } catch {
    /* 保持默认 */
  }
}

async function savePomodoro() {
  pomoSaving.value = true;
  try {
    const cfg = await savePomodoroConfig({
      workMin: pomoWork.value,
      breakMin: pomoBreak.value,
      longBreakMin: pomoLongBreak.value,
      longBreakEvery: pomoLongEvery.value,
    });
    pomoWork.value = cfg.workMin;
    pomoBreak.value = cfg.breakMin;
    pomoLongBreak.value = cfg.longBreakMin;
    pomoLongEvery.value = cfg.longBreakEvery;
    notify('番茄设置已保存');
  } catch (e) {
    notify(e instanceof Error ? e.message : '保存失败');
  } finally {
    pomoSaving.value = false;
  }
}

async function saveLlm() {
  try {
    const res = await saveLlmConfig({
      baseUrl: llmBaseUrl.value.trim(),
      model: llmModel.value.trim(),
      apiKey: llmApiKey.value.trim() ? llmApiKey.value.trim() : undefined,
    });
    llmHasKey.value = res.hasKey;
    llmApiKey.value = '';
    notify('大模型配置已保存');
  } catch (e) {
    notify(e instanceof Error ? e.message : '保存失败');
  }
}

async function doTestLlm() {
  llmTesting.value = true;
  llmStatus.value = '测试中…';
  llmStatusOk.value = false;
  try {
    const res = await testLlm();
    llmStatusOk.value = res.ok;
    llmStatus.value = res.message;
  } catch (e) {
    llmStatusOk.value = false;
    llmStatus.value = e instanceof Error ? e.message : '测试失败';
  } finally {
    llmTesting.value = false;
  }
}

onMounted(() => {
  load();
  loadLlm();
  loadPomodoro();
});

async function copyUrl(url: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      // 局域网 HTTP 环境下降级为 execCommand
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    notify('已复制');
  } catch {
    notify('复制失败');
  }
}

function enableNotifications() {
  if (!('Notification' in window)) {
    notify('此浏览器不支持通知');
    return;
  }
  Notification.requestPermission()
    .then((p) => {
      if (p === 'granted') notify('通知权限已授予');
      else if (p === 'denied') notify('通知权限被拒绝');
      else notify('通知权限未授予');
    })
    .catch(() => notify('请求通知权限失败'));
}

function sendTestNotification() {
  if (!('Notification' in window)) {
    notify('此浏览器不支持通知');
    return;
  }
  if (Notification.permission !== 'granted') {
    notify('请先启用桌面通知');
    return;
  }
  try {
    new Notification('任务四象限', { body: '这是一条测试通知' });
    notify('测试通知已发送');
  } catch {
    notify('发送通知失败');
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-head">
        <h2 class="modal-title">设置</h2>
        <button class="modal-close" @click="emit('close')">×</button>
      </div>

      <div class="settings-body">
        <div class="settings-section">
          <h3 class="settings-section-title">连接状态</h3>
          <span
            class="settings-status conn"
            :class="connected ? 'conn-ok' : 'conn-err'"
          >
            <span class="conn-dot"></span>
            {{ connected ? '已连接' : '未连接' }}
          </span>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title">手机访问地址</h3>
          <div v-if="loading" class="loading-wrap" style="padding: 16px 0">
            <div class="spinner"></div>
          </div>
          <template v-else-if="info && info.addresses.length">
            <div
              v-for="addr in info.addresses"
              :key="addr.ip"
              class="settings-addr"
            >
              <span class="addr-url">{{ addr.url }}</span>
              <button class="copy-btn" @click="copyUrl(addr.url)">复制</button>
            </div>
          </template>
          <div v-else class="settings-note">未检测到局域网地址</div>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title">番茄工作法</h3>
          <div class="pomo-config-grid">
            <label class="pomo-config-item">
              <span class="llm-label">工作时间（分钟）</span>
              <input v-model.number="pomoWork" class="input" type="number" min="5" max="120" />
            </label>
            <label class="pomo-config-item">
              <span class="llm-label">短休息（分钟）</span>
              <input v-model.number="pomoBreak" class="input" type="number" min="1" max="60" />
            </label>
            <label class="pomo-config-item">
              <span class="llm-label">大休息（分钟）</span>
              <input v-model.number="pomoLongBreak" class="input" type="number" min="1" max="120" />
            </label>
            <label class="pomo-config-item">
              <span class="llm-label">几个番茄后大休息</span>
              <input v-model.number="pomoLongEvery" class="input" type="number" min="1" max="12" />
            </label>
          </div>
          <div class="settings-actions">
            <button class="settings-btn" :disabled="pomoSaving" @click="savePomodoro">
              {{ pomoSaving ? '保存中…' : '保存番茄设置' }}
            </button>
          </div>
          <span class="settings-note">
            默认 25 分钟工作 / 5 分钟短休息 / 每 4 个番茄后 15 分钟大休息；开始番茄时使用此工作时间
          </span>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title">大模型（生成日报/周报/月报）</h3>
          <div class="llm-form">
            <label class="llm-field">
              <span class="llm-label">接口地址（OpenAI 兼容）</span>
              <input v-model="llmBaseUrl" class="input" placeholder="https://api.deepseek.com/v1" />
            </label>
            <label class="llm-field">
              <span class="llm-label">模型名</span>
              <input v-model="llmModel" class="input" placeholder="deepseek-chat" />
            </label>
            <label class="llm-field">
              <span class="llm-label">API Key
                <em v-if="llmHasKey" class="llm-has-key">（已配置，留空则不修改）</em>
                <em v-else class="llm-no-key">（未配置）</em>
              </span>
              <input v-model="llmApiKey" class="input" type="password" placeholder="sk-..." />
            </label>
            <div class="settings-actions">
              <button class="settings-btn" @click="saveLlm">保存配置</button>
              <button class="settings-btn" :disabled="llmTesting" @click="doTestLlm">
                {{ llmTesting ? '测试中…' : '测试连接' }}
              </button>
            </div>
            <span
              v-if="llmStatus"
              class="settings-note"
              :class="llmStatusOk ? 'llm-ok' : 'llm-err'"
              >{{ llmStatus }}</span
            >
            <span class="settings-note">
              密钥只保存在本机电脑的配置文件里；DeepSeek 用 https://api.deepseek.com/v1 + deepseek-chat
            </span>
          </div>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title">服务信息</h3>
          <div class="settings-row">
            <span class="label">数据端口</span>
            <span class="value">{{ info ? info.port : '—' }}</span>
          </div>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title">桌面通知</h3>
          <div class="settings-actions">
            <button class="settings-btn" @click="enableNotifications">
              启用桌面通知
            </button>
            <button class="settings-btn" @click="sendTestNotification">
              发送测试通知
            </button>
          </div>
          <span class="settings-note"
            >用于浏览器内提醒，需要浏览器支持 Notification API</span
          >
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn btn-ghost" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>
