'use strict';

const { contextBridge } = require('electron');

// 前端通过同源 REST API 与内置服务通信，preload 只暴露少量桌面环境信息
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  electronVersion: process.versions.electron,
});
