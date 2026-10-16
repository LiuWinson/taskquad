# TaskQuad 服务端 REST API 契约

本文档是服务端（Node.js）、Web 前端（Vue3）、Electron 桌面端、鸿蒙原生 App 之间的唯一接口契约。**任何实现必须严格遵循本文件。**

## 1. 基本约定

- 传输格式：JSON，请求与响应均使用 UTF-8。
- 时间字段：ISO 8601 字符串（如 `2026-01-15T10:30:00.000Z`），可空为 `null`。
- 四象限 key（固定值，禁止修改）：

| key | 中文标签 |
| --- | --- |
| `IU` | 重要且紧急 |
| `IN` | 重要不紧急 |
| `NU` | 紧急不重要 |
| `NN` | 不重要不紧急 |

- 错误响应统一格式：`{ "error": "错误描述" }`，配 4xx/5xx 状态码。
- 服务端默认端口 `8788`，监听 `0.0.0.0`（局域网可访问）。
- CORS：允许任意来源（供手机浏览器直接访问 Web UI）。

## 2. 数据模型 Task

```json
{
  "id": "uuid 字符串",
  "title": "任务标题（非空）",
  "note": "备注（可空字符串）",
  "quadrant": "IU | IN | NU | NN",
  "dueAt": "截止时间 ISO 或 null",
  "remindAt": "提醒时间 ISO 或 null",
  "completed": false,
  "completedAt": "完成时间 ISO 或 null",
  "createdAt": "创建时间 ISO",
  "updatedAt": "最后更新时间 ISO",
  "remindedAt": "最近一次已触发提醒对应的 remindAt 值（内部字段，用于防重复提醒）",
  "order": 1756000000000.5,
  "planDate": "2026-10-16",
  "planStart": 540,
  "planEnd": 630,
  "planProgress": 60,
  "planEndNotified": false,
  "repeat": "daily",
  "occurrences": { "2026-10-16": { "completed": true, "progress": 60, "notified": true } }
}
```

- `order`：象限内排序值（number，允许浮点）。创建时取时间戳；客户端拖拽排序时取相邻两项的**中点**写入（如 `(前项.order + 后项.order) / 2`），首位置用 `前项.order - 1`、末位置用 `末项.order + 1`。服务端启动时对旧数据自动补齐（缺失时取 createdAt 时间戳），保证旧版本数据升级后可用。
- **每日计划字段**（1.2.0 新增，旧数据自动补默认值）：
  - `planDate`：计划日期 `YYYY-MM-DD`（本地时区），`null` = 未排入计划。
  - `planStart` / `planEnd`：当天分钟数（0..1440），必须是 **30 的倍数**，且 `planEnd > planStart`。
  - `planProgress`：完成百分比反馈 0..100（整数），`null` = 未反馈。任务可被排入计划多次，每次变更时间段后重置为 `null`。（循环任务不使用此字段，用 `occurrences` 按天记录。）
  - `planEndNotified`：计划结束“待反馈”通知是否已发（内部字段）。
- **循环任务字段**（1.3.0 新增，旧数据自动补默认值）：
  - `repeat`：`none | daily | weekly | monthly | quarterly`。`planDate` 为基准日（锚点）；命中规则：daily=每天；weekly=同星期几；monthly=同号（目标月不足时取月末，如 31 日 → 2 月 28/29 日）；quarterly=同号且同季（1/4/7/10 月起）。
  - `occurrences`：按日期记录的当天完成状态 `{ "YYYY-MM-DD": { completed?, progress?, notified? } }`。循环任务每天的完成/反馈互不影响；任务本体保持未完成（在四象限中持续循环），要停止循环设置 `repeat: none`。

## 3. 接口列表

### 3.1 GET /api/health
探活。响应 `200`：`{ "ok": true, "name": "taskquad-server", "version": "1.0.0", "time": "<ISO>" }`

### 3.2 GET /api/info
服务器信息，供客户端显示“手机连接地址”。响应 `200`：

```json
{
  "ok": true,
  "name": "taskquad-server",
  "version": "1.0.0",
  "port": 8788,
  "startedAt": "<ISO>",
  "addresses": [
    { "ip": "192.168.1.5", "url": "http://192.168.1.5:8788" }
  ]
}
```

`addresses` 只包含 IPv4 局域网地址（排除 127.0.0.1 与 169.254.x.x）。

### 3.3 GET /api/tasks
返回全部任务。响应 `200`：

```json
{ "tasks": [ Task, ... ] }
```

排序规则：未完成在前、已完成在后；未完成按 `dueAt` 升序（无截止时间 `null` 排在该组末尾，按 createdAt 降序）；已完成按 `completedAt` 降序。

### 3.4 POST /api/tasks
创建任务。请求体：

```json
{ "title": "写周报", "note": "可选", "quadrant": "IU", "dueAt": "ISO 或 null", "remindAt": "ISO 或 null" }
```

- `title` 必填（trim 后非空），`quadrant` 必填且必须是 4 个 key 之一。
- 服务端填充 `id/createdAt/updatedAt/completed=false/completedAt=null/remindedAt=null`。
- 响应 `201`：`{ "task": Task }`

### 3.5 PATCH /api/tasks/:id
局部更新。请求体为任意字段子集：`{ "title"?, "note"?, "quadrant"?, "dueAt"?, "remindAt"?, "completed"?, "order"?, "planDate"?, "planStart"?, "planEnd"?, "planProgress"? }`。

规则：
- 更新 `updatedAt`。
- `completed: true` → 设置 `completedAt = now`；`completed: false` → `completedAt = null`（即“恢复任务”）。
- 当 `remindAt` 字段出现且与当前值不同 → 将 `remindedAt` 重置为 `null`（允许新时间再次提醒）。
- `dueAt`/`remindAt` 允许为 `null`（清除）。
- `order`：必须为有限数值（`Number.isFinite`），用于拖拽排序/跨象限移动；`quadrant` 与 `order` 可同时提交（拖拽到其他象限时一次完成）。
- **计划字段**：
  - `planDate`：`YYYY-MM-DD`；提交 `null` 表示**移出计划**（清空全部计划字段）。
  - `planStart`/`planEnd`：`null` 清除；数值必须是 30 的倍数（0..1440），`planEnd > planStart`，否则 `400`。若提交时 `planDate` 为空则自动使用**当天**。
  - `planDate`/`planStart`/`planEnd` 任一发生变化 → `planProgress` 重置为 `null`、`planEndNotified` 重置为 `false`（重新排期后需重新反馈）。
  - `planProgress`：`null` 清除；数值需在 0..100（四舍五入取整），否则 `400`。
- **循环字段**：
  - `repeat`：`none/daily/weekly/monthly/quarterly`，非法值 `400`。
  - `occurrenceDate` + `occurrenceCompleted`：写入/撤销某天的完成记录（循环任务按天完结，不影响任务本体）。
  - `occurrenceDate` + `occurrenceProgress`：写入/清除某天的完成百分比（0..100，否则 `400`）。
  - `occurrenceDate` + `occurrenceNotified`：标记某天“计划结束待反馈”通知已发（服务端内部使用）。
- 不存在的 id 响应 `404 { "error": "任务不存在" }`。
- 响应 `200`：`{ "task": Task }`

### 3.6 DELETE /api/tasks/:id
删除任务（含已完成归档任务）。响应 `200`：`{ "ok": true }`；不存在响应 `404`。

### 3.7 GET /api/archive?period=week|month|quarter
返回指定周期内**已完成**的任务。`period` 缺省为 `week`，非法值回退 `week`。

周期边界（服务器本地时区）：
- `week`：本周一 00:00:00 → 当前时刻
- `month`：本月 1 日 00:00:00 → 当前时刻
- `quarter`：本季度第一天（1/4/7/10 月 1 日）00:00:00 → 当前时刻

响应 `200`：

```json
{
  "period": "week",
  "start": "<ISO>",
  "end": "<ISO>",
  "tasks": [ Task, ... ]
}
```

`tasks` 仅含 `completedAt` 落在 `[start, end]` 内的任务，按 `completedAt` 降序。

## 4. 提醒机制（服务端负责 Windows 桌面提醒）

- 服务端每 15 秒检查一次：`!completed && remindAt != null && remindAt <= now && remindedAt !== remindAt` 的任务。
- 命中后：触发一次提醒回调（Electron 弹桌面通知），并把该任务的 `remindedAt` 置为 `remindAt`。
- 重启服务后已提醒过的任务不会重复提醒（因为 `remindedAt === remindAt`）。
- **每日计划结束待反馈**：任务 `planDate` 为今天且 `planEnd <= 当前分钟`、未完成、未反馈（`planProgress == null`）、未通知过 → 触发一次回调（`kind: 'planEnd'`，桌面端弹「时间段已结束，请反馈完成情况」），并置 `planEndNotified = true`。修改时间段后重置为 `false`，可再次提醒。
- **循环任务计划结束待反馈（按天）**：`repeat != none` 且今天命中循环规则、`planEnd <= 当前分钟`、当天记录未完成/未反馈/未通知 → 触发一次 `planEnd` 回调，并置 `occurrences[今天].notified = true`（第二天可再次提醒）。
- 鸿蒙端提醒由鸿蒙 App 本地调度（见 harmonyos 说明），服务端只负责桌面端。

## 5. 版本与兼容

- 所有响应额外字段允许新增（客户端应忽略未知字段）。
- 客户端所有请求必须带 `Accept: application/json`；POST/PATCH 带 `Content-Type: application/json`。

## 6. 数据持久化与升级兼容

- 数据文件为 JSON：`{ "schemaVersion": 1, "tasks": [...] }`，存放在数据目录（开发模式 `server/data/tasks.json`；打包安装后 `%APPDATA%\taskquad-desktop\data\tasks.json`）。
- **数据目录与安装目录分离**：安装包升级（覆盖安装）只替换程序文件，数据目录不受影响，升级不清数据；卸载程序也不会删除数据目录。
- 服务启动时对旧格式数据做**归一化迁移**：缺失 `schemaVersion`（1.0 版）或缺失 `order`/计划字段等的记录会被自动补齐后按新格式保存，任务内容不丢失。
- **启动自动备份**：每次启动时若数据文件与最近一次备份不同，先整体复制到 `data/backups/tasks.<时间戳>.json`（保留最近 30 份）。即使未来迁移出现意外，也可从备份完整恢复旧数据。
- 未来 schema 变更时在 `_normalizeTasks` 中追加迁移逻辑，`schemaVersion` 递增。
