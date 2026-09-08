'use strict';

const path = require('path');
const { app, BrowserWindow, Tray, Menu, Notification, dialog } = require('electron');

const APP_NAME = '任务四象限';
let mainWindow = null;
let tray = null;
let isQuitting = false;
let taskServer = null;

// 基础目录：开发态 = 仓库根；打包态 = resources 目录（extraResources 输出位置）
const baseDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..');
const serverDir = path.join(baseDir, 'server');
const webRoot = path.join(baseDir, 'web', 'dist');
const dataDir = app.isPackaged ? path.join(app.getPath('userData'), 'data') : path.join(baseDir, 'server', 'data');

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showMainWindow();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 420,
    minHeight: 620,
    title: APP_NAME,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'app-icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(taskServer.url);

  // 关闭窗口 → 最小化到托盘常驻，保证提醒服务不中断
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, '..', 'assets', 'tray.png'));
  tray.setToolTip(APP_NAME);
  const menu = Menu.buildFromTemplate([
    { label: '打开' + APP_NAME, click: () => showMainWindow() },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleMainWindow);
  tray.on('double-click', showMainWindow);
}

function notifyReminder(task) {
  try {
    const n = new Notification({
      title: APP_NAME + ' · 任务提醒',
      body: task.title + (task.dueAt ? '（截止 ' + formatTime(task.dueAt) + '）' : ''),
    });
    n.on('click', showMainWindow);
    n.show();
  } catch (e) {
    console.error('[notify]', e);
  }
}

function formatTime(iso) {
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 尝试添加 Windows 防火墙入站规则（需管理员权限；失败则静默，首次监听时系统也会弹出放行提示）
function tryAddFirewallRule() {
  try {
    const { execFile } = require('child_process');
    execFile(
      'netsh',
      ['advfirewall', 'firewall', 'add', 'rule', 'name=TaskQuad', 'dir=in', 'action=allow',
       'program=' + process.execPath, 'enable=yes', 'profile=any'],
      { windowsHide: true },
      () => {}
    );
  } catch (_) {
    /* 忽略 */
  }
}

async function main() {
  app.setName('taskquad-desktop');
  app.setAppUserModelId('com.taskquad.desktop');

  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on('second-instance', showMainWindow);

  // 内置同步服务（含提醒调度）
  try {
    const { createTaskServer } = require(path.join(serverDir, 'src', 'server.js'));
    taskServer = await createTaskServer({ dataDir, webRoot, onRemind: notifyReminder });
  } catch (e) {
    dialog.showErrorBox(APP_NAME, '服务启动失败（端口 ' + 8788 + ' 可能被占用）：\n' + e.message);
    app.quit();
    return;
  }

  await app.whenReady();

  Menu.setApplicationMenu(null);
  createWindow();
  createTray();
  tryAddFirewallRule();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });

  // 托盘常驻：不因窗口全部关闭而退出
  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    isQuitting = true;
    if (taskServer) taskServer.stop();
  });

  console.log(`[desktop] ${APP_NAME} 已启动，服务地址 ${taskServer.url}`);
}

main().catch((e) => {
  dialog.showErrorBox(APP_NAME, '启动失败：' + e.message);
  app.quit();
});
