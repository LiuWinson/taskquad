'use strict';

/**
 * 提醒调度器：每 intervalMs 扫描一次，命中条件：
 *   !completed && remindAt && remindAt <= now && remindedAt !== remindAt
 * 命中后回调 onRemind(task)，并把 remindedAt 记为 remindAt，防止重复提醒。
 */
function createReminderScheduler(store, onRemind, intervalMs = 15000) {
  let timer = null;

  function tick() {
    const now = Date.now();
    for (const task of store.tasks) {
      if (task.completed || !task.remindAt) continue;
      const remindTime = new Date(task.remindAt).getTime();
      if (Number.isNaN(remindTime)) continue;
      if (remindTime <= now && task.remindedAt !== task.remindAt) {
        store.markReminded(task.id, task.remindAt);
        try {
          onRemind(task);
        } catch (e) {
          console.error('[reminder] onRemind 回调异常:', e);
        }
      }
    }
  }

  return {
    start() {
      if (timer) return;
      tick();
      timer = setInterval(tick, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    tick,
  };
}

module.exports = { createReminderScheduler };
