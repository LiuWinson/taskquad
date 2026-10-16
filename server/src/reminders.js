'use strict';

const { todayLocalDate, nowLocalMinutes, matchesRepeatDate } = require('./store');

/**
 * 提醒调度器：每 intervalMs 扫描一次。
 *
 * ① 普通提醒：!completed && remindAt && remindAt <= now && remindedAt !== remindAt
 *    命中后 onRemind(task, { kind: 'remind' })，并把 remindedAt 记为 remindAt，防止重复提醒。
 *
 * ② 每日计划结束待反馈（非循环）：任务被排入今天的计划，计划结束时间已过，
 *    未完成、未反馈、未通知过 → onRemind(task, { kind: 'planEnd' })，置 planEndNotified = true。
 *
 * ③ 每日计划结束待反馈（循环任务）：今天命中循环规则且计划结束时间已过，
 *    当天的完成记录未完成、未反馈、未通知 → onRemind(task, { kind: 'planEnd' })，
 *    并把 occurrences[今天].notified = true（按天独立，第二天可再次提醒）。
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
      // ② 计划结束待反馈（非循环）
      if (!task.completed && task.repeat === 'none' && task.planDate === today &&
          typeof task.planStart === 'number' && typeof task.planEnd === 'number' &&
          task.planEnd <= nowMin && !task.planEndNotified && task.planProgress == null) {
        store.markPlanEndNotified(task.id);
        fire(task, 'planEnd');
      }
      // ③ 计划结束待反馈（循环任务，按天独立）
      if (!task.completed && task.repeat !== 'none' &&
          typeof task.planStart === 'number' && typeof task.planEnd === 'number' &&
          task.planEnd <= nowMin && matchesRepeatDate(task.planDate, task.repeat, today)) {
        const occ = (task.occurrences && task.occurrences[today]) || null;
        const done = !!(occ && occ.completed);
        const hasProgress = !!(occ && typeof occ.progress === 'number');
        const notified = !!(occ && occ.notified);
        if (!done && !hasProgress && !notified) {
          store.markOccurrenceNotified(task.id, today);
          fire(task, 'planEnd');
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
