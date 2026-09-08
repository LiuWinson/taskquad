'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const QUADRANTS = ['IU', 'IN', 'NU', 'NN'];
const SCHEMA_VERSION = 1;

/**
 * JSON 文件持久化存储。
 * 数据量级为个人任务清单，直接内存态 + 原子写盘即可。
 * 数据文件带 schemaVersion，升级版本时在 _load 中对旧数据做归一化迁移，
 * 旧版本数据永不丢失。
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

  _load() {
    fs.mkdirSync(this.dataDir, { recursive: true });
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
    };
    this.tasks.push(task);
    this._save();
    return task;
  }

  update(id, patch) {
    const task = this.get(id);
    if (!task) return null;
    const allowed = ['title', 'note', 'quadrant', 'dueAt', 'remindAt', 'completed', 'order'];
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
      }
    }
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

module.exports = { TaskStore, QUADRANTS };
