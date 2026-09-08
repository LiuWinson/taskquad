# 任务四象限 · 鸿蒙端构建与配对指南

本目录是「任务四象限」鸿蒙原生 App 的完整工程源码（ArkTS + Stage 模型，目标 HarmonyOS NEXT / API 12），可在 DevEco Studio 中直接打开构建。

## 功能

- 连接 Windows 端「任务四象限」桌面应用内置的局域网服务（默认端口 8788），共享同一份任务数据
- 四象限看板（重要且紧急 / 重要不紧急 / 紧急不重要 / 不重要不紧急）、列表视图、归档视图（本周 / 本月 / 本季度）
- 任务记录：标题、备注、四象限标签、需要完成的时间、提醒时间（含截止前 5 分钟/15 分钟/1 小时/1 天快捷填充）
- 完成打钩即归档，可恢复 / 删除
- 系统级定时提醒（reminderAgentManager）：同步后本地调度，App 关闭后照常提醒
- 前台每 30 秒自动同步

## 前置条件

1. **DevEco Studio 5.0 及以上**（含 HarmonyOS SDK API 12）。下载：https://developer.huawei.com/consumer/cn/deveco-studio/
2. **华为开发者账号**：真机安装需要签名（HAP 签名证书自动生成即可）
3. 一台 HarmonyOS NEXT 真机（或使用模拟器调试；模拟器也可运行，但提醒需真机验证）
4. Windows 电脑上已运行「任务四象限」桌面应用，且手机与电脑在同一 WiFi

## 构建步骤

1. 打开 DevEco Studio → `File > Open`，选择本 `harmonyos` 目录，等待工程 Sync 完成（会自动下载 hvigor / ohpm 依赖）。
2. 签名配置：`File > Project Structure > Signing Configs`，勾选 **Automatically generate signature**，登录华为账号后自动生成调试证书。
3. 连接真机：手机开启「开发者模式」与「USB 调试」（设置 → 关于手机 → 连点版本号 7 次；设置 → 系统与更新 → 开发者选项），USB 连接电脑并在手机上允许调试。
4. 点击工具栏绿色 **Run** 按钮（选择你的真机设备），等待安装启动。
5. 也可 `Build > Build Hap(s)/App(s)` 产出 HAP，用 hdc install 或 DevEco 工具安装。

## 首次配对

1. Windows 桌面应用右上角「设置」→ 查看「手机访问地址」（例如 `http://192.168.1.5:8788`）。
2. 手机 App 右上角「设置」→ 填入该地址 → 点「保存」→ 点「测试连接」，出现「连接成功 ✓」即完成。
3. 返回主界面，右上角状态点变绿「已连接」，任务自动同步，提醒权限首次进入时自动申请（如被拒，去系统设置 → 应用 → 任务四象限 → 权限中打开）。

## 常见问题

| 问题 | 处理 |
| --- | --- |
| Sync 报错 | 确认 DevEco 版本 ≥ 5.0；`File > Sync and Refresh Project`；检查网络可访问华为镜像 |
| 提示 SDK 版本不匹配 | 安装 API 12 SDK：`Settings > SDK Manager` 勾选 API 12 下载 |
| 无法签名 | 登录华为账号后重新勾选 Automatically generate signature |
| 测试连接失败 | 同一 WiFi；电脑防火墙放行 8788；确认电脑端应用未退出（关闭窗口会在托盘常驻） |
| 收不到提醒 | 至少成功同步过一次；检查系统设置中应用的通知与提醒权限；勿在「电池优化」中限制本 App 后台 |
| 界面显示"未配置" | 到设置页填写服务器地址并保存 |

## 工程结构

```
harmonyos/
├─ AppScope/                    # 应用级配置（app.json5、图标、名称）
├─ build-profile.json5          # 签名/产品配置（compatibleSdkVersion 5.0.0(12)）
├─ hvigor/                      # 构建工具配置
├─ entry/src/main/
│  ├─ module.json5              # 模块配置（INTERNET、PUBLISH_AGENT_REMINDER 权限）
│  ├─ ets/entryability/EntryAbility.ets
│  ├─ ets/model/Task.ets        # 数据模型与四象限常量
│  ├─ ets/model/Api.ets         # REST API 封装
│  ├─ ets/model/Settings.ets    # 服务器地址持久化
│  ├─ ets/model/Reminders.ets   # 系统提醒对账
│  ├─ ets/pages/Index.ets       # 主界面（四象限/列表/归档）
│  ├─ ets/pages/SettingsPage.ets
│  ├─ ets/components/TaskEditDialog.ets
│  └─ resources/                # 字符串、颜色、图标、页面路由
└─ entry/obfuscation-rules.txt
```

## 提示

- 数据始终存放在 Windows 电脑端，手机不保存副本；断网/电脑关机时手机端无法操作。
- 修改 Windows 端任务后，手机端下次同步（30 秒内或回到前台时）自动更新并重新调度提醒。
