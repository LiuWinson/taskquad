'use strict';

/**
 * 报告生成：收集「上一日/周/月已完成」+「本日/周/月计划」，交给大模型生成日报/周报/月报。
 */
const { matchesRepeatDate } = require('./store');

const QUADRANT_LABEL = { IU: '重要且紧急', IN: '重要不紧急', NU: '紧急不重要', NN: '不重要不紧急' };
const TYPE_LABEL = { daily: '日报', weekly: '周报', monthly: '月报' };

function pad2(n) {
  return String(n).padStart(2, '0');
}
function fmtDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay() === 0 ? 7 : x.getDay();
  x.setDate(x.getDate() - day + 1);
  return x;
}
function startOfMonth(d) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

/** 某任务在某天的计划时间段（含循环规则） */
function planOnDay(task, dateStr) {
  if (task.completed) return null;
  if (typeof task.planStart !== 'number' || typeof task.planEnd !== 'number' || !task.planDate) return null;
  const hit = task.repeat && task.repeat !== 'none'
    ? matchesRepeatDate(task.planDate, task.repeat, dateStr)
    : task.planDate === dateStr;
  if (!hit) return null;
  const hm = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  return `${hm(task.planStart)}-${hm(task.planEnd)}`;
}

function pomodoroCounts(task, fromMs, toMs) {
  let done = 0;
  let interrupted = 0;
  for (const p of task.pomodoros || []) {
    if (p.status === 'completed' || p.status === 'interrupted') {
      const t = Date.parse(p.startAt);
      if (Number.isFinite(t) && t >= fromMs && t < toMs) {
        if (p.status === 'completed') done += 1;
        else interrupted += 1;
      }
    }
  }
  return { done, interrupted };
}

function doneLine(task, fromMs, toMs) {
  const q = QUADRANT_LABEL[task.quadrant] || '未分类';
  const when = task.completedAt ? fmtDateTime(task.completedAt) : '';
  const pm = pomodoroCounts(task, fromMs, toMs);
  const pomo = pm.done > 0 ? `；番茄 ${pm.done} 个` : '';
  const intr = pm.interrupted > 0 ? `；中断 ${pm.interrupted} 次` : '';
  return `- ${task.title}（${q}${when ? '，' + when + '完成' : ''}${pomo}${intr}）`;
}

/**
 * 收集报告素材
 * @returns {{ type, periodLabel, done: string[], plan: string[], doneCount, planCount }}
 */
function gather(store, type) {
  const now = new Date();
  const todayStr = fmtDate(now);
  let doneFrom;
  let doneTo;
  let planFrom;
  let planTo;
  let periodLabel;

  if (type === 'weekly') {
    const thisWeekStart = startOfWeek(now);
    doneTo = thisWeekStart;
    doneFrom = new Date(thisWeekStart);
    doneFrom.setDate(doneFrom.getDate() - 7);
    planFrom = thisWeekStart;
    planTo = new Date(thisWeekStart);
    planTo.setDate(planTo.getDate() + 7);
    periodLabel = '本周';
  } else if (type === 'monthly') {
    const thisMonthStart = startOfMonth(now);
    doneTo = thisMonthStart;
    doneFrom = new Date(thisMonthStart);
    doneFrom.setMonth(doneFrom.getMonth() - 1);
    planFrom = thisMonthStart;
    planTo = new Date(thisMonthStart);
    planTo.setMonth(planTo.getMonth() + 1);
    periodLabel = '本月';
  } else {
    const todayStart = startOfDay(now);
    doneTo = todayStart;
    doneFrom = new Date(todayStart);
    doneFrom.setDate(doneFrom.getDate() - 1);
    planFrom = todayStart;
    planTo = new Date(todayStart);
    planTo.setDate(planTo.getDate() + 1);
    periodLabel = '今天';
  }

  const doneFromMs = doneFrom.getTime();
  const doneToMs = doneTo.getTime();
  const planFromMs = planFrom.getTime();
  const planToMs = planTo.getTime();

  const done = [];
  const plan = [];
  for (const t of store.tasks) {
    // 已完成：完成时间落在上一窗口
    if (t.completed && t.completedAt) {
      const ct = Date.parse(t.completedAt);
      if (Number.isFinite(ct) && ct >= doneFromMs && ct < doneToMs) {
        done.push({ task: t, sortKey: ct, line: doneLine(t, doneFromMs, doneToMs) });
      }
    }
  }
  done.sort((a, b) => a.sortKey - b.sortKey);

  // 计划：窗口内每天的计划块（含循环任务），或截止时间落在窗口内
  const dayCount = Math.max(1, Math.round((planToMs - planFromMs) / 86400000));
  for (const t of store.tasks) {
    if (t.completed) continue;
    let line = null;
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(planFrom);
      d.setDate(d.getDate() + i);
      const ds = fmtDate(d);
      const slot = planOnDay(t, ds);
      if (slot) {
        const label = type === 'daily' ? `${slot}` : `${d.getMonth() + 1}月${d.getDate()}日 ${slot}`;
        line = `- ${t.title}（${QUADRANT_LABEL[t.quadrant] || '未分类'}，计划 ${label}）`;
        break;
      }
    }
    if (!line && t.dueAt) {
      const dt = Date.parse(t.dueAt);
      if (Number.isFinite(dt) && dt >= planFromMs && dt < planToMs) {
        line = `- ${t.title}（${QUADRANT_LABEL[t.quadrant] || '未分类'}，截止 ${fmtDateTime(t.dueAt)}）`;
      }
    }
    if (!line) continue;
    const qOrder = { IU: 0, IN: 1, NU: 2, NN: 3 }[t.quadrant];
    plan.push({ task: t, sortKey: qOrder != null ? qOrder : 9, line });
  }
  plan.sort((a, b) => a.sortKey - b.sortKey);

  return {
    type,
    periodLabel,
    todayStr,
    done: done.map((x) => x.line),
    plan: plan.map((x) => x.line),
    doneCount: done.length,
    planCount: plan.length,
  };
}

function buildPrompt(data) {
  const typeLabel = TYPE_LABEL[data.type] || '日报';
  const prevLabel = data.type === 'weekly' ? '上周' : (data.type === 'monthly' ? '上月' : '前一日');
  const curLabel = data.periodLabel;
  const doneText = data.done.length ? data.done.join('\n') : '（无完成记录）';
  const planText = data.plan.length ? data.plan.join('\n') : '（暂无计划）';
  const requirements = [
    '你是我的个人任务管理助手。请根据下面真实的任务数据，生成一份中文' + typeLabel + '（Markdown 格式）。',
    '',
    '【' + prevLabel + '已完成】',
    doneText,
    '',
    '【' + curLabel + '计划】',
    planText,
    '',
    '输出要求：',
    '1. 结构固定：一是「' + prevLabel + '进展」二级标题，二是「' + curLabel + '计划」二级标题；',
    '2. 进展部分按完成情况归纳 3-6 条要点，突出关键成果与投入（同类任务可合并，番茄数量可作为投入参考）；',
    '3. 计划部分按四象限优先级排序（重要且紧急在前），每条一行、带任务名；',
    '4. 语言简洁客观，只能使用上面提供的数据，不要编造；全文 200-350 字；',
    '5. 直接输出报告正文，不要额外解释。',
  ];
  return requirements.join('\n');
}

module.exports = { gather, buildPrompt, TYPE_LABEL };
