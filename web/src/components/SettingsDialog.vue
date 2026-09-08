<script setup lang="ts">
import { ref, inject, onMounted } from 'vue';
import { getInfo, type InfoResponse } from '../api';

defineProps<{
  connected: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const notify = inject<(message: string) => void>('notify', () => {});

const info = ref<InfoResponse | null>(null);
const loading = ref(false);

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

onMounted(load);

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
