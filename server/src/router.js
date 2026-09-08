'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { QUADRANTS } = require('./store');

const VERSION = '1.1.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (_) {
        reject(new Error('JSON 解析失败'));
      }
    });
    req.on('error', reject);
  });
}

function lanAddresses() {
  const list = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('169.254.')) continue;
      list.push(info.address);
    }
  }
  return [...new Set(list)];
}

/**
 * 构造请求处理器。
 * @param {TaskStore} store
 * @param {{webRoot?: string, onRemind?: (task) => void}} options
 */
function createRouter(store, options = {}) {
  const { webRoot = null } = options;
  const routerState = { startedAt: new Date().toISOString() };

  async function handleApi(req, res, pathname, searchParams) {
    // GET /api/health
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, name: 'taskquad-server', version: VERSION, time: new Date().toISOString() });
    }
    // GET /api/info
    if (req.method === 'GET' && pathname === '/api/info') {
      const port = store.config.port;
      return sendJson(res, 200, {
        ok: true,
        name: 'taskquad-server',
        version: VERSION,
        port,
        startedAt: routerState.startedAt,
        addresses: lanAddresses().map((ip) => ({ ip, url: `http://${ip}:${port}` })),
      });
    }
    // GET /api/tasks
    if (req.method === 'GET' && pathname === '/api/tasks') {
      return sendJson(res, 200, { tasks: store.listSorted() });
    }
    // POST /api/tasks
    if (req.method === 'POST' && pathname === '/api/tasks') {
      let body;
      try {
        body = await readBody(req);
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
      const title = body.title == null ? '' : String(body.title).trim();
      if (!title) return sendJson(res, 400, { error: '标题不能为空' });
      const quadrant = body.quadrant;
      if (!QUADRANTS.includes(quadrant)) return sendJson(res, 400, { error: '无效的四象限标签' });
      const task = store.create({
        title,
        note: body.note,
        quadrant,
        dueAt: body.dueAt || null,
        remindAt: body.remindAt || null,
      });
      return sendJson(res, 201, { task });
    }
    // /api/tasks/:id
    const taskMatch = pathname.match(/^\/api\/tasks\/([0-9a-fA-F-]+)$/);
    if (taskMatch) {
      const id = taskMatch[1];
      if (req.method === 'PATCH') {
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          return sendJson(res, 400, { error: e.message });
        }
        try {
          const task = store.update(id, body);
          if (!task) return sendJson(res, 404, { error: '任务不存在' });
          return sendJson(res, 200, { task });
        } catch (e) {
          return sendJson(res, 400, { error: e.message });
        }
      }
      if (req.method === 'DELETE') {
        const ok = store.remove(id);
        if (!ok) return sendJson(res, 404, { error: '任务不存在' });
        return sendJson(res, 200, { ok: true });
      }
    }
    // GET /api/archive
    if (req.method === 'GET' && pathname === '/api/archive') {
      const period = searchParams.get('period') || 'week';
      return sendJson(res, 200, store.archive(period));
    }
    return sendJson(res, 404, { error: '接口不存在' });
  }

  function serveStatic(req, res, pathname) {
    if (!webRoot) return sendJson(res, 404, { error: '未配置前端静态目录' });
    let rel = decodeURIComponent(pathname);
    if (rel === '/') rel = '/index.html';
    // 防目录穿越
    const target = path.normalize(path.join(webRoot, rel));
    if (!target.startsWith(path.normalize(webRoot))) return sendJson(res, 403, { error: '禁止访问' });
    let filePath = target;
    let stat;
    try {
      stat = fs.statSync(filePath);
      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
      fs.statSync(filePath);
    } catch (_) {
      // SPA 回退到 index.html
      filePath = path.join(webRoot, 'index.html');
      try {
        fs.statSync(filePath);
      } catch (__) {
        return sendJson(res, 404, { error: '页面不存在' });
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': fs.statSync(filePath).size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    fs.createReadStream(filePath).pipe(res);
  }

  return async function router(req, res) {
    // CORS 预检与头
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
      });
      return res.end();
    }
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;
      if (pathname.startsWith('/api/')) {
        return await handleApi(req, res, pathname, url.searchParams);
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        return serveStatic(req, res, pathname);
      }
      return sendJson(res, 404, { error: '接口不存在' });
    } catch (e) {
      if (!res.headersSent) return sendJson(res, 500, { error: e.message || '服务器内部错误' });
      res.end();
    }
  };
}

module.exports = { createRouter, lanAddresses, VERSION };
