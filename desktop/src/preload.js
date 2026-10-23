'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 前端通过同源 REST API 与内置服务通信，preload 只暴露少量桌面环境信息
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  electronVersion: process.versions.electron,
  // 主窗口从托盘重新显示时通知前端（用于跨天刷新"今天"等状态）
  onWindowShown: (cb) => {
    ipcRenderer.on('window-shown', () => cb());
  },
  // 系统级提醒：系统通知 + 右下角置顶小窗（番茄到点/休息结束用）
  alert: (payload) => {
    ipcRenderer.send('pomodoro-alert', payload || {});
  },
});
