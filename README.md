# 任务四象限（TaskQuad）

一个**跨 Windows 桌面端与鸿蒙手机端**的四象限任务管理应用：记录任务、设置完成时间与提醒时间，按「重要且紧急 / 重要不紧急 / 紧急不重要 / 不重要不紧急」四象限管理，完成后打钩自动归档到**本周 / 本月 / 本季度**完成清单。

> ⚖️ **许可证**：本仓库代码公开可见，但为**专有软件（All Rights Reserved）**，未授予任何使用/复制/修改/分发许可，详见 [LICENSE](LICENSE)。

## 📥 直接下载安装（无需构建）

- **Windows 安装包**：https://github.com/LiuWinson/taskquad/releases/latest → 下载 `TaskQuad-Setup-1.1.0.exe`，双击安装即用（首次启动如遇 SmartScreen 提示，点「更多信息 → 仍要运行」）。
- 覆盖安装新版本**不会清除数据**；卸载程序也不会删除数据。
- 鸿蒙端目前需按下方说明用 DevEco Studio 自行构建（见 [harmonyos/README-build.md](harmonyos/README-build.md)）。

## 功能特性

- 任务记录：标题、备注、四象限标签、需要完成的时间、提醒时间
- 四象限看板：2×2 矩阵（重要且紧急 · 重要不紧急 · 紧急不重要 · 不重要不紧急），逾期任务红色高亮
- **拖拽排序**：按住任务可拖动——同一象限内调整顺序，拖到其他象限即改变分类（桌面端/浏览器）
- 列表视图：按截止时间排序，逾期标红
- 完成打钩：勾选即完成，自动移入归档
- 归档视图：本周 / 本月 / 本季度三个维度查看已完成事务，支持恢复与删除
- 提醒：Windows 桌面端弹系统通知（托盘常驻、关闭窗口不中断）；鸿蒙端由系统 reminderAgentManager 定时提醒
- 双端同步：Windows 端内置局域网服务，鸿蒙 App 连同一 WiFi 即可共享同一份数据
- **升级不清数据**：数据独立存放在 `%APPDATA%\taskquad-desktop\data`，安装包覆盖升级只替换程序、不动数据；旧版本数据文件自动迁移补齐新字段

## 架构

```
┌─────────────────────────────┐         同一 WiFi（HTTP :8788）
│  Windows 桌面应用（Electron）│
│  ├─ Web UI（Vue3，四象限界面）│◄────────┐
│  ├─ 内置 Node 服务（REST API）│         │
│  ├─ 任务存储（JSON 持久化）   │         ├── 鸿蒙原生 App（ArkTS，系统级提醒）
│  ├─ 提醒调度（桌面通知）      │         │
│  └─ 系统托盘常驻             │         └── 手机浏览器（可选，直接开网址）
└─────────────────────────────┘
```

- **数据只存在 Windows 端**（`tasks.json`），手机端读写同一份数据，天然一致，无需云服务。
- 端口默认 **8788**，Windows 应用启动后自动监听局域网。

## 目录结构

```
todolist/
├─ server/        # 服务端核心（纯 Node，无依赖）：存储 + REST API + 提醒调度 + 静态托管
├─ web/           # Vue3 + Vite + TypeScript 前端（打包产物 web/dist/）
├─ desktop/       # Electron 桌面壳：托盘、桌面通知、内置服务、打包配置
├─ harmonyos/     # 鸿蒙原生 App 工程（DevEco Studio 5.x / API 12）
├─ docs/          # API.md（接口契约）、DESIGN.md（设计规范）
└─ assets/        # 图标源文件
```

## Windows 端

### 开发运行（源码方式）

前置：Node.js ≥ 18（建议 20+）。

```powershell
cd <本项目目录>
npm run web:build          # 构建前端（产物 web/dist/）
npm --prefix desktop install   # 首次安装 Electron（走国内镜像，见 .npmrc）
npm run desktop            # 启动桌面应用
```

窗口关闭后应用常驻系统托盘，双击托盘图标重新打开；提醒到达时弹出 Windows 通知，点击通知回到应用。

### 打包安装程序（NSIS 安装包）

```powershell
npm run web:build
npm --prefix desktop run dist
# 产物：desktop/dist/任务四象限 Setup <版本号>.exe
```

安装后首次启动，Windows 防火墙可能弹出「允许访问网络」，请选择**允许（专用网络）**，否则手机无法连接。应用也会尝试自动添加名为 `TaskQuad` 的防火墙入站规则（需要管理员权限，失败不影响使用）。

**版本更新**：直接运行新版安装包覆盖安装即可——数据目录与安装目录分离，任务数据、设置全部保留；旧版本数据文件会在首次启动时自动补齐新字段（schemaVersion 迁移）。卸载程序也不会删除数据。

### 手机连接地址

桌面应用右上角「设置」→ 显示当前局域网地址（如 `http://192.168.1.5:8788`），鸿蒙 App 中填入即可。

## 鸿蒙端

见 [`harmonyos/README-build.md`](harmonyos/README-build.md)：在 DevEco Studio 中打开 `harmonyos/` 目录，签名后构建安装；App 内「设置」填入 Windows 端局域网地址并测试连接。

## 手机浏览器备用方案

鸿蒙手机（或任何手机）浏览器直接打开 Windows 端显示的局域网网址（如 `http://192.168.1.5:8788`）即可使用完整 Web 界面。注意：浏览器方式下提醒依赖 Windows 端在线弹通知，手机自身不会定时提醒（需要系统级提醒请用鸿蒙原生 App）。

## 数据存储位置

- 开发模式：`server/data/tasks.json`
- 打包安装后：`%APPDATA%\taskquad-desktop\data\tasks.json`

备份该文件即可迁移全部数据。**升级/重装应用不会清除此目录**；除非手动删除，数据一直保留。

## 常见问题

| 问题 | 处理 |
| --- | --- |
| 手机连不上 | 确认手机与电脑连同一 WiFi；检查 Windows 防火墙放行 8788；在桌面端「设置」确认局域网 IP |
| 端口被占用 | 关闭占用 8788 的程序，或修改 `server/data/config.json` 的 `port` 后重启（手机端地址同步修改） |
| Windows 不弹提醒 | 系统设置 → 通知 → 允许应用发送通知；确认任务设置了提醒时间且未完成 |
| 鸿蒙端提醒不生效 | 确认已授予提醒权限（系统设置 → 应用 → 任务四象限 → 权限）；提醒由 App 同步任务后本地调度，需保持一次成功同步 |
| 数据想重置 | 关闭应用，删除数据目录后重启 |
