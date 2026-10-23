'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Tray, Menu, Notification, dialog, screen, ipcMain, shell } = require('electron');

const APP_NAME = '任务四象限';
let mainWindow = null;
let tray = null;
let isQuitting = false;
let taskServer = null;
let alertWindow = null;
let alertTimer = null;

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
  try {
    mainWindow.flashFrame(false);
  } catch (_) {}
  // 通知前端窗口已显示（跨天校准"今天"、刷新计划等）
  if (!mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('window-shown');
  }
}

// ---------- 番茄提醒：系统通知 + 右下角置顶小窗（不抢焦点，工作时也能看到） ----------
function logAlert(msg) {
  try {
    fs.appendFileSync(
      path.join(dataDir, 'alerts.log'),
      new Date().toISOString() + ' ' + msg + '\n',
      'utf8',
    );
  } catch (_) {
    /* 日志失败不影响提醒 */
  }
}

function closeAlertWindow() {
  if (alertTimer) {
    clearTimeout(alertTimer);
    alertTimer = null;
  }
  if (alertWindow && !alertWindow.isDestroyed()) {
    try {
      alertWindow.close();
    } catch (_) {}
  }
  alertWindow = null;
}

function showDesktopAlert(payload) {
  const title = (payload && payload.title) || '番茄时间到！';
  const body = (payload && payload.body) || '';
  const icon = (payload && payload.icon) || '🍅';
  logAlert('show title=' + title + ' body=' + body);

  // 提示音（全屏应用下也能听见）
  try {
    shell.beep();
  } catch (_) {}

  // ① Windows 系统通知（通知中心，切到别的应用也能看到）
  try {
    const n = new Notification({ title, body, silent: false });
    n.on('click', () => {
      showMainWindow();
      closeAlertWindow();
    });
    n.show();
  } catch (e) {
    console.error('[alert] notification', e);
    logAlert('notification error: ' + (e && e.message));
  }

  // ② 屏幕正中央置顶提醒窗（始终浮于最上层；showInactive 不抢键盘焦点）
  closeAlertWindow();
  try {
    // 居中显示到鼠标所在显示器的工作区
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const wa = display.workArea;
    const w = 620;
    const h = 300;
    alertWindow = new BrowserWindow({
      width: w,
      height: h,
      x: Math.round(wa.x + (wa.width - w) / 2),
      y: Math.round(wa.y + (wa.height - h) / 2),
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    alertWindow.setAlwaysOnTop(true, 'screen-saver');
    alertWindow.loadFile(path.join(__dirname, 'alert.html'));
    alertWindow.once('ready-to-show', () => {
      if (!alertWindow || alertWindow.isDestroyed()) return;
      const js =
        `document.getElementById('icon').textContent = ${JSON.stringify(icon)};` +
        `document.getElementById('title').textContent = ${JSON.stringify(title)};` +
        `document.getElementById('body').textContent = ${JSON.stringify(body)};`;
      alertWindow.webContents.executeJavaScript(js).catch(() => {});
      alertWindow.showInactive();
      alertWindow.moveTop();
      logAlert('alert window shown (center) ' + w + 'x' + h);
    });
    alertWindow.on('closed', () => {
      alertWindow = null;
      logAlert('alert window closed');
    });
    // 90 秒后自动关闭，避免长期遮挡
    alertTimer = setTimeout(() => closeAlertWindow(), 90000);
  } catch (e) {
    console.error('[alert] window', e);
    logAlert('window error: ' + (e && e.message));
  }

  // ③ 任务栏图标闪烁（窗口最小化时也能引起注意）
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(true);
  } catch (_) {}
}

ipcMain.on('pomodoro-alert', (_event, payload) => {
  showDesktopAlert(payload);
});

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
      // 窗口在托盘/被遮挡时也保持定时器精度（否则 Chromium 会节流，番茄到点/休息结束提醒会延迟）
      backgroundThrottling: false,
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

function notifyReminder(task, meta) {
  try {
    const kind = meta && meta.kind ? meta.kind : 'remind';
    let title = APP_NAME + ' · 任务提醒';
    let body = task.title + (task.dueAt ? '（截止 ' + formatTime(task.dueAt) + '）' : '');
    let icon = '⏰';
    if (kind === 'planEnd') {
      title = APP_NAME + ' · 计划已结束';
      body = `「${task.title}」的时间段已结束，请反馈完成情况`;
      icon = '📅';
    } else if (kind === 'pomodoroEnd') {
      title = APP_NAME + ' · 番茄完成';
      body = `「${task.title}」的番茄已完成，休息一下再开始下一个`;
      icon = '🍅';
    }
    showDesktopAlert({ title, body, icon });
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
    closeAlertWindow();
    if (taskServer) taskServer.stop();
  });

  console.log(`[desktop] ${APP_NAME} 已启动，服务地址 ${taskServer.url}`);
}

main().catch((e) => {
  dialog.showErrorBox(APP_NAME, '启动失败：' + e.message);
  app.quit();
});
