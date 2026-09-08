'use strict';

/**
 * 独立运行入口：node src/index.js [--port 8788] [--data-dir ./data] [--web-root ../web/dist]
 * Electron 桌面端则直接 require('./server') 内嵌运行。
 */
const path = require('path');
const { createTaskServer, lanAddresses, VERSION } = require('./server');

function parseArgs(argv) {
  const args = { port: null, dataDir: null, webRoot: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') args.port = parseInt(argv[++i], 10);
    else if (a === '--data-dir') args.dataDir = argv[++i];
    else if (a === '--web-root') args.webRoot = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const dataDir = args.dataDir ? path.resolve(args.dataDir) : path.join(__dirname, '..', 'data');
  const webRoot = args.webRoot ? path.resolve(args.webRoot) : path.join(__dirname, '..', '..', 'web', 'dist');

  const server = await createTaskServer({
    dataDir,
    port: args.port,
    webRoot,
    onRemind: (task) => {
      console.log(`[reminder] 「${task.title}」提醒时间到（${task.remindAt}）`);
    },
  });

  console.log(`TaskQuad 服务 v${VERSION} 已启动`);
  console.log(`  本机访问:  ${server.url}`);
  for (const ip of lanAddresses()) {
    console.log(`  手机访问:  http://${ip}:${server.port}`);
  }
  console.log(`  数据目录:  ${dataDir}`);
}

main().catch((e) => {
  console.error('启动失败:', e.message);
  process.exit(1);
});
