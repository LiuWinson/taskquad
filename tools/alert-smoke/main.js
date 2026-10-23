'use strict';

// 冒烟测试：验证 alert.html 能在 Electron 中加载，且无边框置顶窗口可以创建（不抢焦点）
const path = require('path');
const { app, BrowserWindow, screen } = require('electron');

const ALERT_HTML = path.join(__dirname, '..', '..', 'desktop', 'src', 'alert.html');

app.whenReady()
  .then(async () => {
    const wa = screen.getPrimaryDisplay().workArea;
    const w = 620;
    const h = 300;
    const win = new BrowserWindow({
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
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    await win.loadFile(ALERT_HTML);
    await win.webContents.executeJavaScript(
      "document.getElementById('title').textContent = 'SMOKE-OK'; document.getElementById('body').textContent = '置顶提醒窗测试';",
    );
    win.showInactive();
    const title = await win.webContents.executeJavaScript(
      "document.getElementById('title').textContent",
    );
    console.log(
      'SMOKE: shown title=' + title + ' bounds=' + JSON.stringify(win.getBounds()) +
        ' alwaysOnTop=' + win.isAlwaysOnTop(),
    );
    setTimeout(() => {
      console.log('SMOKE: done');
      app.exit(0);
    }, 2500);
  })
  .catch((e) => {
    console.error('SMOKE FAIL', e);
    app.exit(1);
  });
