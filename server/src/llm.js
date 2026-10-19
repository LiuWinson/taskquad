'use strict';

/**
 * OpenAI 兼容大模型客户端（DeepSeek/OpenAI/通义等均可）
 * 配置保存在 config.json 的 llm 字段：{ baseUrl, apiKey, model }
 */
const DEFAULT_LLM = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
};

function getLlmConfig(store) {
  const c = (store.config && store.config.llm) || {};
  return {
    baseUrl: typeof c.baseUrl === 'string' && c.baseUrl.trim() ? c.baseUrl.trim() : DEFAULT_LLM.baseUrl,
    model: typeof c.model === 'string' && c.model.trim() ? c.model.trim() : DEFAULT_LLM.model,
    apiKey: typeof c.apiKey === 'string' ? c.apiKey : '',
  };
}

function saveLlmConfig(store, patch) {
  const cur = getLlmConfig(store);
  const next = {
    baseUrl: patch.baseUrl != null ? String(patch.baseUrl).trim() : cur.baseUrl,
    model: patch.model != null ? String(patch.model).trim() : cur.model,
    apiKey: patch.apiKey != null ? String(patch.apiKey).trim() : cur.apiKey,
  };
  if (!next.baseUrl) next.baseUrl = DEFAULT_LLM.baseUrl;
  if (!next.model) next.model = DEFAULT_LLM.model;
  store.config.llm = next;
  store.saveConfig();
  return next;
}

/** 调用 chat/completions，返回文本内容 */
async function llmChat(store, messages, options = {}) {
  const cfg = getLlmConfig(store);
  if (!cfg.apiKey) {
    throw new Error('未配置大模型 API Key：请到「设置 → 大模型」中填写');
  }
  const timeoutMs = options.timeoutMs || 60000;
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: options.temperature != null ? options.temperature : 0.4,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error('大模型接口返回 ' + resp.status + '：' + String(text).slice(0, 300));
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error('大模型返回非 JSON：' + String(text).slice(0, 200));
    }
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    if (!content) throw new Error('大模型返回内容为空');
    return String(content).trim();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('大模型请求超时（' + Math.round(timeoutMs / 1000) + ' 秒）');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function llmTest(store) {
  const cfg = getLlmConfig(store);
  if (!cfg.apiKey) return { ok: false, message: '未配置 API Key' };
  try {
    const r = await llmChat(store, [{ role: 'user', content: '请只回复两个字母：OK' }], { timeoutMs: 20000, temperature: 0 });
    return { ok: true, message: '连接成功：' + String(r).slice(0, 60) };
  } catch (e) {
    return { ok: false, message: e.message || String(e) };
  }
}

module.exports = { DEFAULT_LLM, getLlmConfig, saveLlmConfig, llmChat, llmTest };
