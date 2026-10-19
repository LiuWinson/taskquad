// REST API 访问封装。基址使用同源相对路径，不硬编码端口。
// 与 docs/API.md 的接口契约严格一致。

import type { Task, QuadrantKey } from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface JsonResponse {
  [key: string]: unknown;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch (e) {
    throw new ApiError('网络请求失败，请检查服务是否已启动', 0);
  }

  let data: JsonResponse | null = null;
  try {
    data = (await res.json()) as JsonResponse;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      data && typeof data.error === 'string'
        ? data.error
        : `请求失败（${res.status}）`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}

export interface TaskListResponse {
  tasks: Task[];
}

export interface TaskResponse {
  task: Task;
}

export interface OkResponse {
  ok: boolean;
}

export interface InfoAddress {
  ip: string;
  url: string;
}

export interface InfoResponse {
  ok: boolean;
  name: string;
  version: string;
  port: number;
  startedAt: string;
  addresses: InfoAddress[];
}

export interface HealthResponse {
  ok: boolean;
  name: string;
  version: string;
  time: string;
}

export type ArchivePeriod = 'week' | 'month' | 'quarter';

export interface ArchiveResponse {
  period: string;
  start: string;
  end: string;
  tasks: Task[];
}

export interface TaskPayload {
  title: string;
  note?: string;
  quadrant: QuadrantKey;
  dueAt: string | null;
  remindAt: string | null;
}

export interface TaskPatch {
  title?: string;
  note?: string;
  quadrant?: QuadrantKey;
  dueAt?: string | null;
  remindAt?: string | null;
  completed?: boolean;
  order?: number;
  planDate?: string | null;
  planStart?: number | null;
  planEnd?: number | null;
  planProgress?: number | null;
  repeat?: string;
  occurrenceDate?: string;
  occurrenceCompleted?: boolean;
  occurrenceProgress?: number | null;
  occurrenceNotified?: boolean;
}

export function getTasks(): Promise<TaskListResponse> {
  return request<TaskListResponse>('/api/tasks');
}

export function createTask(payload: TaskPayload): Promise<TaskResponse> {
  return request<TaskResponse>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateTask(id: string, patch: TaskPatch): Promise<TaskResponse> {
  return request<TaskResponse>(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteTask(id: string): Promise<OkResponse> {
  return request<OkResponse>(`/api/tasks/${id}`, {
    method: 'DELETE',
  });
}

export function getArchive(period: ArchivePeriod): Promise<ArchiveResponse> {
  return request<ArchiveResponse>(`/api/archive?period=${period}`);
}

export function getInfo(): Promise<InfoResponse> {
  return request<InfoResponse>('/api/info');
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health');
}

// ---------- 番茄工作法 ----------

export function startPomodoro(id: string, plannedMin?: number): Promise<TaskResponse> {
  return request<TaskResponse>(`/api/tasks/${id}/pomodoro`, {
    method: 'POST',
    body: JSON.stringify(plannedMin == null ? { action: 'start' } : { action: 'start', plannedMin }),
  });
}

export function completePomodoro(id: string): Promise<TaskResponse> {
  return request<TaskResponse>(`/api/tasks/${id}/pomodoro`, {
    method: 'POST',
    body: JSON.stringify({ action: 'complete' }),
  });
}

export function interruptPomodoro(id: string, reason: string): Promise<TaskResponse> {
  return request<TaskResponse>(`/api/tasks/${id}/pomodoro`, {
    method: 'POST',
    body: JSON.stringify({ action: 'interrupt', reason }),
  });
}

export interface PomodoroConfig {
  ok?: boolean;
  workMin: number;
  breakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
}

export function getPomodoroConfig(): Promise<PomodoroConfig> {
  return request<PomodoroConfig>('/api/pomodoro-config');
}

export function savePomodoroConfig(payload: {
  workMin: number;
  breakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
}): Promise<PomodoroConfig> {
  return request<PomodoroConfig>('/api/pomodoro-config', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ---------- 大模型配置与报告 ----------

export interface LlmConfigResponse {
  ok: boolean;
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

export interface LlmTestResponse {
  ok: boolean;
  message: string;
}

export type ReportType = 'daily' | 'weekly' | 'monthly';

export interface ReportResponse {
  ok: boolean;
  report: string;
  meta: {
    type: ReportType;
    doneCount: number;
    planCount: number;
    periodLabel: string;
  };
}

export function getLlmConfig(): Promise<LlmConfigResponse> {
  return request<LlmConfigResponse>('/api/llm-config');
}

export function saveLlmConfig(payload: {
  baseUrl: string;
  model: string;
  apiKey?: string;
}): Promise<LlmConfigResponse> {
  return request<LlmConfigResponse>('/api/llm-config', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function testLlm(): Promise<LlmTestResponse> {
  return request<LlmTestResponse>('/api/llm-test', { method: 'POST', body: '{}' });
}

export function generateReport(type: ReportType): Promise<ReportResponse> {
  return request<ReportResponse>('/api/reports/generate', {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
}
