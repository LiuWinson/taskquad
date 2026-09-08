'use strict';

const http = require('http');
const { TaskStore } = require('./store');
const { createRouter, lanAddresses, VERSION } = require('./router');
const { createReminderScheduler } = require('./reminders');

/**
 * 创建 TaskQuad 服务。
 * @param {{dataDir: string, port?: number, webRoot?: string|null, onRemind?: (task)=>void, host?: string}} options
 * @returns {Promise<{httpServer, store, port, url, stop: ()=>void}>}
 */
async function createTaskServer(options) {
  const dataDir = options.dataDir;
  const store = new TaskStore(dataDir);
  const wantPort = options.port || store.config.port || 8788;
  const webRoot = options.webRoot || null;
  const host = options.host || '0.0.0.0';
  const onRemind = options.onRemind || (() => {});

  const router = createRouter(store, { webRoot });

  const httpServer = http.createServer((req, res) => {
    router(req, res).catch((e) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message || '服务器内部错误' }));
      } else {
        res.end();
      }
    });
  });

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(wantPort, host, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });

  const port = httpServer.address().port;
  // 仅在使用默认端口成功启动时持久化；显式 --port 覆盖（如测试）不写入配置
  if (!options.port && store.config.port !== port) {
    store.config.port = port;
    store.saveConfig();
  }

  const scheduler = createReminderScheduler(store, onRemind, 15000);
  scheduler.start();

  const stop = () => {
    scheduler.stop();
    httpServer.close();
  };

  return { httpServer, store, port, url: `http://127.0.0.1:${port}`, stop };
}

module.exports = { createTaskServer, lanAddresses, VERSION };
