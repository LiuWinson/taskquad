'use strict';

const { todayLocalDate, nowLocalMinutes } = require('./store');

/**
 * 提醒调度器：每 intervalMs 扫描一次。
 *
 * ① 普通提醒：!completed && remindAt && remindAt <= now && remindedAt !== remindAt
 *    命中后 onRemind(task, { kind: 'remind' })，并把 remindedAt 记为 remindAt，防止重复提醒。
 *
 * ② 每日计划结束待反馈：任务被排入今天的计划，计划结束时间已过，未完成、未反馈、未通知过
 *    命中后 onRemind(task, { kind: 'planEnd' })，并置 planEndNotified = true。
 */
function createReminderScheduler(store, onRemind, intervalMs = 15000) {
  let timer = null;

  function fire(task, kind) {
    try {
      onRemind(task, { kind });
    } catch (e) {
      console.error('[reminder] onRemind 回调异常:', e);
    }
  }

  function tick() {
    const now = Date.now();
    const today = todayLocalDate();
    const nowMin = nowLocalMinutes();
    for (const task of store.tasks) {
      // ① 普通提醒
      if (!task.completed && task.remindAt) {
        const remindTime = new Date(task.remindAt).getTime();
        if (!Number.isNaN(remindTime) && remindTime <= now && task.remindedAt !== task.remindAt) {
          store.markReminded(task.id, task.remindAt);
          fire(task, 'remind');
        }
      }
      // ② 计划结束待反馈
      if (!task.completed && task.planDate === today &&
          typeof task.planStart === 'number' && typeof task.planEnd === 'number' &&
          task.planEnd <= nowMin && !task.planEndNotified && task.planProgress == null) {
        store.markPlanEndNotified(task.id);
        fire(task, 'planEnd');
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
