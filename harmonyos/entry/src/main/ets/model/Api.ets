// REST API 访问封装（与 docs/API.md 契约一致）
import http from '@ohos.net.http';
import { Task } from './Task';
import { AppSettings } from './Settings';

export class TaskCreate {
  title: string;
  note: string;
  quadrant: string;
  dueAt: string | null;
  remindAt: string | null;

  constructor(title: string, note: string, quadrant: string, dueAt: string | null, remindAt: string | null) {
    this.title = title;
    this.note = note;
    this.quadrant = quadrant;
    this.dueAt = dueAt;
    this.remindAt = remindAt;
  }
}

export class TaskUpdate {
  title: string;
  note: string;
  quadrant: string;
  dueAt: string | null;
  remindAt: string | null;

  constructor(title: string, note: string, quadrant: string, dueAt: string | null, remindAt: string | null) {
    this.title = title;
    this.note = note;
    this.quadrant = quadrant;
    this.dueAt = dueAt;
    this.remindAt = remindAt;
  }
}

export class TaskComplete {
  completed: boolean;

  constructor(completed: boolean) {
    this.completed = completed;
  }
}

export class TaskListResponse {
  tasks: Task[];

  constructor(tasks: Task[]) {
    this.tasks = tasks;
  }
}

export class ArchiveResponse {
  period: string;
  start: string;
  end: string;
  tasks: Task[];

  constructor(period: string, start: string, end: string, tasks: Task[]) {
    this.period = period;
    this.start = start;
    this.end = end;
    this.tasks = tasks;
  }
}

export class Api {
  /** 最近一次失败原因（供 UI 展示） */
  static lastError: string = '';

  static async requestUrl(method: http.RequestMethod, baseUrl: string, path: string, body: string): Promise<string> {
    Api.lastError = '';
    let url = baseUrl.trim();
    if (!url) {
      Api.lastError = '未配置服务器地址，请先到「设置」填写';
      return '';
    }
    while (url.endsWith('/')) {
      url = url.substring(0, url.length - 1);
    }
    url = url + path;
    const httpRequest = http.createHttp();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    const options: http.HttpRequestOptions = {
      method: method,
      header: headers,
      expectDataType: http.HttpDataType.STRING,
      connectTimeout: 5000,
      readTimeout: 8000
    };
    if (body.length > 0) {
      options.extraData = body;
    }
    try {
      const resp = await httpRequest.request(url, options);
      const text = resp.result as string;
      if (resp.responseCode !== 200 && resp.responseCode !== 201) {
        Api.lastError = '服务器返回错误（' + resp.responseCode.toString() + '）';
        return '';
      }
      return text;
    } catch (e) {
      Api.lastError = '无法连接服务器：请确认电脑端已启动、手机与电脑在同一 WiFi，地址为 ' + baseUrl.trim();
      return '';
    } finally {
      httpRequest.destroy();
    }
  }

  static async request(method: http.RequestMethod, path: string, body: string): Promise<string> {
    const base = await AppSettings.getServerUrl();
    return Api.requestUrl(method, base, path, body);
  }

  /** 探活；success 时返回 true */
  static async healthWith(baseUrl: string): Promise<boolean> {
    const text = await Api.requestUrl(http.RequestMethod.GET, baseUrl, '/api/health', '');
    return text.length > 0;
  }

  static async getTasks(): Promise<Task[]> {
    const text = await Api.request(http.RequestMethod.GET, '/api/tasks', '');
    if (!text) {
      return [];
    }
    const resp = JSON.parse(text) as TaskListResponse;
    return resp.tasks;
  }

  static async createTask(c: TaskCreate): Promise<boolean> {
    const text = await Api.request(http.RequestMethod.POST, '/api/tasks', JSON.stringify(c));
    return text.length > 0;
  }

  static async updateTask(id: string, u: TaskUpdate): Promise<boolean> {
    const text = await Api.request(http.RequestMethod.PATCH, '/api/tasks/' + id, JSON.stringify(u));
    return text.length > 0;
  }

  static async setCompleted(id: string, done: boolean): Promise<boolean> {
    const body = new TaskComplete(done);
    const text = await Api.request(http.RequestMethod.PATCH, '/api/tasks/' + id, JSON.stringify(body));
    return text.length > 0;
  }

  static async deleteTask(id: string): Promise<boolean> {
    const text = await Api.request(http.RequestMethod.DELETE, '/api/tasks/' + id, '');
    return text.length > 0;
  }

  static async getArchive(period: string): Promise<Task[]> {
    const text = await Api.request(http.RequestMethod.GET, '/api/archive?period=' + period, '');
    if (!text) {
      return [];
    }
    const resp = JSON.parse(text) as ArchiveResponse;
    return resp.tasks;
  }
}
