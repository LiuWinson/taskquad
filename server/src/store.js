'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const QUADRANTS = ['IU', 'IN', 'NU', 'NN'];
const SCHEMA_VERSION = 1;
const MAX_BACKUPS = 30;

/** 本地日期 YYYY-MM-DD */
function todayLocalDate(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 本地当天已过分钟数 0..1439 */
function nowLocalMinutes(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

/** 计划时间必须是 0..1440 内 30 的倍数 */
function validSlotMinutes(v) {
  return Number.isInteger(v) && v >= 0 && v <= 1440 && v % 30 === 0;
}

/**
 * JSON 文件持久化存储。
 * 数据量级为个人任务清单，直接内存态 + 原子写盘即可。
 * 数据文件带 schemaVersion，升级版本时在 _load 中对旧数据做归一化迁移，
 * 旧版本数据永不丢失；每次启动还会先自动备份原始数据文件到 data/backups/。
 */
class TaskStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.tasksFile = path.join(dataDir, 'tasks.json');
    this.configFile = path.join(dataDir, 'config.json');
    this.tasks = [];
    this.config = { port: 8788 };
    this._load();
  }

  _backupIfChanged() {
    let raw = null;
    try {
      raw = fs.readFileSync(this.tasksFile, 'utf8');
    } catch (_) {
      return; // 首次运行：无文件可备份
    }
    const backupsDir = path.join(this.dataDir, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    // 与最近一次备份内容一致则跳过，避免每次重启都堆积
    let newest = null;
    try {
      const list = fs.readdirSync(backupsDir).filter((f) => /^tasks\.\d{4}-\d{2}-\d{2}T.*\.json$/.test(f)).sort();
      if (list.length) newest = list[list.length - 1];
    } catch (_) {}
    if (newest) {
      try {
        if (fs.readFileSync(path.join(backupsDir, newest), 'utf8') === raw) return;
      } catch (_) {}
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(backupsDir, `tasks.${stamp}.json`), raw, 'utf8');
    // 只保留最近 MAX_BACKUPS 份
    try {
      const list = fs.readdirSync(backupsDir).filter((f) => /^tasks\.\d{4}-\d{2}-\d{2}T.*\.json$/.test(f)).sort();
      while (list.length > MAX_BACKUPS) {
        const old = list.shift();
        fs.unlinkSync(path.join(backupsDir, old));
      }
    } catch (_) {}
  }

  _load() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    this._backupIfChanged();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.tasksFile, 'utf8'));
      if (Array.isArray(parsed.tasks)) this.tasks = parsed.tasks;
    } catch (_) {
      /* 首次运行或文件损坏：保持空列表 */
    }
    this._normalizeTasks();
    try {
      this.config = Object.assign({ port: 8788 }, JSON.parse(fs.readFileSync(this.configFile, 'utf8')));
    } catch (_) {
      /* 使用默认配置 */
    }
  }

  /** 旧版本数据迁移：补齐缺失字段，保证旧数据在新版本可用 */
  _normalizeTasks() {
    const now = Date.now();
    for (const t of this.tasks) {
      if (typeof t.order !== 'number' || !Number.isFinite(t.order)) {
        const ts = Date.parse(t.createdAt || '');
        t.order = Number.isFinite(ts) ? ts : now;
      }
      if (typeof t.note !== 'string') t.note = t.note == null ? '' : String(t.note);
      if (typeof t.remindedAt !== 'string') t.remindedAt = null;
      if (t.completed && !t.completedAt) t.completedAt = new Date().toISOString();
      // 每日计划字段（1.2.0 新增）：旧数据补默认值
      if (typeof t.planDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.planDate)) t.planDate = null;
      if (!validSlotMinutes(t.planStart)) t.planStart = null;
      if (!validSlotMinutes(t.planEnd)) t.planEnd = null;
      if (typeof t.planStart === 'number' && typeof t.planEnd === 'number' && t.planStart >= t.planEnd) {
        t.planStart = null;
        t.planEnd = null;
      }
      if (t.planDate == null) {
        t.planStart = null;
        t.planEnd = null;
        t.planProgress = null;
        t.planEndNotified = false;
      }
      if (typeof t.planProgress !== 'number' || !Number.isFinite(t.planProgress)) t.planProgress = null;
      else t.planProgress = Math.max(0, Math.min(100, Math.round(t.planProgress)));
      if (typeof t.planEndNotified !== 'boolean') t.planEndNotified = false;
      if (!t.id || !t.title || !QUADRANTS.includes(t.quadrant)) {
        // 极端异常记录：补最小可用字段，不丢数据
        t.id = t.id || crypto.randomUUID();
        t.title = t.title || '（未命名任务）';
        t.quadrant = QUADRANTS.includes(t.quadrant) ? t.quadrant : 'NN';
      }
    }
  }

  _save() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = this.tasksFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ schemaVersion: SCHEMA_VERSION, tasks: this.tasks }, null, 2), 'utf8');
    fs.renameSync(tmp, this.tasksFile);
  }

  saveConfig() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tmp = this.configFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2), 'utf8');
    fs.renameSync(tmp, this.configFile);
  }

  get(id) {
    return this.tasks.find((t) => t.id === id) || null;
  }

  /**
   * 排序：未完成在前（dueAt 升序，null 最后按 createdAt 降序），已完成在后（completedAt 降序）。
   */
  listSorted() {
    return [...this.tasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (!a.completed) {
        if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
        if (a.dueAt && !b.dueAt) return -1;
        if (!a.dueAt && b.dueAt) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      return new Date(b.completedAt || 0) - new Date(a.completedAt || 0);
    });
  }

  create({ title, note, quadrant, dueAt, remindAt }) {
    const now = new Date().toISOString();
    const task = {
      id: crypto.randomUUID(),
      title: String(title).trim(),
      note: note ? String(note) : '',
      quadrant,
      dueAt: dueAt || null,
      remindAt: remindAt || null,
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      remindedAt: null,
      order: Date.now(),
      planDate: null,
      planStart: null,
      planEnd: null,
      planProgress: null,
      planEndNotified: false,
    };
    this.tasks.push(task);
    this._save();
    return task;
  }

  /** 计划字段变更时重置反馈与通知状态 */
  _planChanged(task, oldDate, oldStart, oldEnd) {
    if (task.planDate !== oldDate || task.planStart !== oldStart || task.planEnd !== oldEnd) {
      task.planProgress = null;
      task.planEndNotified = false;
    }
  }

  update(id, patch) {
    const task = this.get(id);
    if (!task) return null;
    const allowed = ['title', 'note', 'quadrant', 'dueAt', 'remindAt', 'completed', 'order',
      'planDate', 'planStart', 'planEnd', 'planProgress'];
    const oldDate = task.planDate;
    const oldStart = task.planStart;
    const oldEnd = task.planEnd;

    // 计划字段整体预校验（开始/结束同时提交时按新值成对校验，避免"拖动整体调整"被旧值误判）
    const clearPlan = 'planDate' in patch && patch.planDate == null;
    const propDate = clearPlan ? null : ('planDate' in patch ? String(patch.planDate) : task.planDate);
    if (propDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(propDate)) throw new Error('无效的计划日期');
    let propStart = clearPlan ? null : ('planStart' in patch ? patch.planStart : task.planStart);
    let propEnd = clearPlan ? null : ('planEnd' in patch ? patch.planEnd : task.planEnd);
    if (propStart != null) {
      propStart = Number(propStart);
      if (!validSlotMinutes(propStart)) throw new Error('计划开始时间必须是 30 分钟的整数倍');
    }
    if (propEnd != null) {
      propEnd = Number(propEnd);
      if (!validSlotMinutes(propEnd)) throw new Error('计划结束时间必须是 30 分钟的整数倍');
    }
    if (propStart != null && propEnd != null && propStart >= propEnd) {
      throw new Error('开始时间必须早于结束时间');
    }
    let propProgress = 'planProgress' in patch ? patch.planProgress : task.planProgress;
    if (propProgress != null) {
      propProgress = Number(propProgress);
      if (!Number.isFinite(propProgress) || propProgress < 0 || propProgress > 100) {
        throw new Error('完成百分比必须在 0-100 之间');
      }
      propProgress = Math.round(propProgress);
    }

    for (const key of allowed) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (key === 'title') {
        if (!value || !String(value).trim()) throw new Error('标题不能为空');
        task.title = String(value).trim();
      } else if (key === 'note') {
        task.note = value == null ? '' : String(value);
      } else if (key === 'quadrant') {
        if (!QUADRANTS.includes(value)) throw new Error('无效的四象限标签');
        task.quadrant = value;
      } else if (key === 'dueAt') {
        task.dueAt = value || null;
      } else if (key === 'remindAt') {
        const next = value || null;
        if (next !== task.remindAt) task.remindedAt = null; // 提醒时间变化后允许再次提醒
        task.remindAt = next;
      } else if (key === 'completed') {
        task.completed = !!value;
        task.completedAt = value ? new Date().toISOString() : null;
      } else if (key === 'order') {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new Error('无效的排序值');
        task.order = n;
      } else if (key === 'planDate') {
        task.planDate = propDate;
      } else if (key === 'planStart') {
        task.planStart = propStart;
        if (task.planStart != null && !task.planDate) task.planDate = todayLocalDate();
      } else if (key === 'planEnd') {
        task.planEnd = propEnd;
        if (task.planEnd != null && !task.planDate) task.planDate = todayLocalDate();
      } else if (key === 'planProgress') {
        task.planProgress = propProgress;
      }
    }
    if (clearPlan) {
      task.planDate = null;
      task.planStart = null;
      task.planEnd = null;
      task.planProgress = null;
      task.planEndNotified = false;
    }
    this._planChanged(task, oldDate, oldStart, oldEnd);
    task.updatedAt = new Date().toISOString();
    this._save();
    return task;
  }

  remove(id) {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    this.tasks.splice(idx, 1);
    this._save();
    return true;
  }

  markReminded(id, remindAt) {
    const task = this.get(id);
    if (!task) return;
    task.remindedAt = remindAt;
    task.updatedAt = new Date().toISOString();
    this._save();
  }

  markPlanEndNotified(id) {
    const task = this.get(id);
    if (!task) return;
    task.planEndNotified = true;
    task.updatedAt = new Date().toISOString();
    this._save();
  }

  /** 指定周期内已完成的任务（按 completedAt 降序） */
  archive(period) {
    const now = new Date();
    const start = new Date(now);
    if (period === 'month') {
      start.setDate(1);
    } else if (period === 'quarter') {
      const q = Math.floor(start.getMonth() / 3) * 3;
      start.setMonth(q, 1);
    } else {
      // week：本周一 00:00:00
      const day = start.getDay() === 0 ? 7 : start.getDay();
      start.setDate(start.getDate() - day + 1);
    }
    start.setHours(0, 0, 0, 0);
    const list = this.tasks
      .filter((t) => t.completed && t.completedAt && new Date(t.completedAt) >= start)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    return { period: ['week', 'month', 'quarter'].includes(period) ? period : 'week', start: start.toISOString(), end: now.toISOString(), tasks: list };
  }
}

module.exports = { TaskStore, QUADRANTS, todayLocalDate, nowLocalMinutes, validSlotMinutes };
