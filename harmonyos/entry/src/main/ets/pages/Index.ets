// 主页面：四象限看板 / 列表 / 归档 三个视图 + 连接状态 + 任务同步
import promptAction from '@ohos.promptAction';
import router from '@ohos.router';
import common from '@ohos.app.ability.common';
import { AppSettings } from '../model/Settings';
import { Api, TaskCreate, TaskUpdate } from '../model/Api';
import { Reminders } from '../model/Reminders';
import { Task, QUADRANTS, QuadrantMeta, quadrantMeta, tintOf, formatDisplay, isOverdue } from '../model/Task';
import { TaskEditDialog } from '../components/TaskEditDialog';

const PERIOD_KEYS: string[] = ['week', 'month', 'quarter'];
const PERIOD_LABELS: string[] = ['本周', '本月', '本季度'];

@Entry
@Component
struct Index {
  @State tasks: Task[] = [];
  @State view: number = 0;
  @State loading: boolean = true;
  @State connected: boolean = false;
  @State hasServer: boolean = false;
  @State errorText: string = '';
  @State archivePeriod: number = 0;
  @State archiveTasks: Task[] = [];
  @State archiveLoading: boolean = false;
  @State editingTaskId: string = '';
  private timerId: number = -1;
  private ctx: common.UIAbilityContext | null = null;
  private dialogController: CustomDialogController | null = null;

  aboutToAppear(): void {
    const ctx = getContext(this) as common.UIAbilityContext;
    this.ctx = ctx;
    Reminders.requestPermission(ctx);
    this.load();
    this.timerId = setInterval(() => {
      this.loadSilent();
    }, 30000);
  }

  aboutToDisappear(): void {
    if (this.timerId >= 0) {
      clearInterval(this.timerId);
      this.timerId = -1;
    }
  }

  onPageShow(): void {
    this.loadSilent();
    if (this.view === 2) {
      this.loadArchive();
    }
  }

  async load(): Promise<void> {
    this.loading = true;
    if (this.ctx) {
      const ctx = this.ctx;
      await AppSettings.init(ctx);
    }
    const base = await AppSettings.getServerUrl();
    this.hasServer = base.trim().length > 0;
    if (!this.hasServer) {
      this.connected = false;
      this.errorText = '未配置服务器地址，请点击右上角「设置」';
      this.loading = false;
      return;
    }
    const ok = await Api.healthWith(base);
    this.connected = ok;
    if (ok) {
      const list = await Api.getTasks();
      this.tasks = list;
      this.errorText = '';
      Reminders.reconcile(list);
    } else {
      this.errorText = Api.lastError;
    }
    this.loading = false;
  }

  async loadSilent(): Promise<void> {
    const base = await AppSettings.getServerUrl();
    if (!base.trim().length) {
      this.hasServer = false;
      this.connected = false;
      return;
    }
    this.hasServer = true;
    const ok = await Api.healthWith(base);
    this.connected = ok;
    if (ok) {
      const list = await Api.getTasks();
      this.tasks = list;
      this.errorText = '';
      Reminders.reconcile(list);
    }
  }

  async toggle(t: Task): Promise<void> {
    const ok = await Api.setCompleted(t.id, !t.completed);
    if (ok) {
      await this.loadSilent();
      if (this.view === 2) {
        await this.loadArchive();
      }
    } else {
      promptAction.showToast({ message: Api.lastError });
    }
  }

  openCreate(q: string): void {
    this.openDialog(null, q);
  }

  openEdit(t: Task): void {
    this.openDialog(t, t.quadrant);
  }

  openDialog(task: Task | null, quadrant: string): void {
    this.editingTaskId = task ? task.id : '';
    const controller = new CustomDialogController({
      builder: TaskEditDialog({
        task: task,
        defaultQuadrant: quadrant,
        onSave: (payload: TaskCreate): void => {
          this.handleSave(payload);
        },
        onDelete: (id: string): void => {
          this.handleDelete(id);
        }
      }),
      customStyle: true,
      autoCancel: true,
      alignment: DialogAlignment.Center
    });
    this.dialogController = controller;
    controller.open();
  }

  async handleSave(payload: TaskCreate): Promise<void> {
    let ok = false;
    if (this.editingTaskId.length > 0) {
      ok = await Api.updateTask(this.editingTaskId, new TaskUpdate(payload.title, payload.note, payload.quadrant, payload.dueAt, payload.remindAt));
    } else {
      ok = await Api.createTask(payload);
    }
    if (ok) {
      promptAction.showToast({ message: '已保存' });
      await this.loadSilent();
    } else {
      promptAction.showToast({ message: Api.lastError });
    }
  }

  async handleDelete(id: string): Promise<void> {
    const ok = await Api.deleteTask(id);
    if (ok) {
      promptAction.showToast({ message: '已删除' });
      await this.loadSilent();
      if (this.view === 2) {
        await this.loadArchive();
      }
    } else {
      promptAction.showToast({ message: Api.lastError });
    }
  }

  async restore(t: Task): Promise<void> {
    const ok = await Api.setCompleted(t.id, false);
    if (ok) {
      promptAction.showToast({ message: '已恢复' });
      await this.loadSilent();
      await this.loadArchive();
    } else {
      promptAction.showToast({ message: Api.lastError });
    }
  }

  async removeArchived(t: Task): Promise<void> {
    const ok = await Api.deleteTask(t.id);
    if (ok) {
      promptAction.showToast({ message: '已删除' });
      await this.loadSilent();
      await this.loadArchive();
    } else {
      promptAction.showToast({ message: Api.lastError });
    }
  }

  async loadArchive(): Promise<void> {
    this.archiveLoading = true;
    const list = await Api.getArchive(this.periodKey());
    this.archiveTasks = list;
    this.archiveLoading = false;
  }

  periodKey(): string {
    return PERIOD_KEYS[this.archivePeriod];
  }

  selectPeriod(i: number): void {
    this.archivePeriod = i;
    this.loadArchive();
  }

  switchView(i: number): void {
    this.view = i;
    if (i === 2) {
      this.loadArchive();
    }
  }

  tasksOf(key: string): Task[] {
    const result: Task[] = [];
    for (let i = 0; i < this.tasks.length; i++) {
      const t = this.tasks[i];
      if (t.quadrant === key && !t.completed) {
        result.push(t);
      }
    }
    // 按拖拽排序值 order 升序（与桌面端一致；旧数据已由服务端归一化）
    result.sort((a: Task, b: Task): number => {
      return a.order - b.order;
    });
    return result;
  }

  activeTasks(): Task[] {
    const result: Task[] = [];
    for (let i = 0; i < this.tasks.length; i++) {
      if (!this.tasks[i].completed) {
        result.push(this.tasks[i]);
      }
    }
    return result;
  }

  @Builder
  taskRow(t: Task) {
    Row({ space: 8 }) {
      Checkbox({ name: 'cb-' + t.id, group: 'g-' + t.id })
        .select(t.completed)
        .onChange((checked: boolean) => {
          this.toggle(t);
        })
      Column({ space: 2 }) {
        Text(t.title)
          .fontSize(15)
          .fontColor(t.completed ? '#999999' : '#222222')
          .decoration({ type: t.completed ? TextDecorationType.LineThrough : TextDecorationType.None, color: '#999999' })
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Row({ space: 6 }) {
          Text(quadrantMeta(t.quadrant).label)
            .fontSize(11)
            .fontColor(quadrantMeta(t.quadrant).color)
            .padding({ left: 6, right: 6, top: 2, bottom: 2 })
            .borderRadius(4)
            .backgroundColor(tintOf(quadrantMeta(t.quadrant).color))
          if (t.dueAt) {
            Text('截止 ' + formatDisplay(t.dueAt))
              .fontSize(11)
              .fontColor(isOverdue(t.dueAt) ? '#E5484D' : '#888888')
              .fontWeight(isOverdue(t.dueAt) ? FontWeight.Bold : FontWeight.Normal)
          }
          if (t.remindAt) {
            Text('🔔 ' + formatDisplay(t.remindAt))
              .fontSize(11)
              .fontColor('#888888')
          }
        }
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
    }
    .width('100%')
    .padding({ left: 12, right: 12, top: 10, bottom: 10 })
    .alignItems(VerticalAlign.Top)
    .onClick(() => {
      this.openEdit(t);
    })
  }

  @Builder
  quadrantCard(q: QuadrantMeta) {
    Column({ space: 4 }) {
      Row({ space: 8 }) {
        Row()
          .width(4)
          .height(18)
          .borderRadius(2)
          .backgroundColor(q.color)
        Text(q.label)
          .fontSize(14)
          .fontWeight(FontWeight.Bold)
          .fontColor('#333333')
          .layoutWeight(1)
        Text(this.tasksOf(q.key).length.toString() + ' 项')
          .fontSize(11)
          .fontColor('#999999')
      }
      .width('100%')
      .padding({ left: 10, right: 10, top: 8, bottom: 4 })

      List({ space: 2 }) {
        if (this.tasksOf(q.key).length === 0) {
          ListItem() {
            Text('暂无任务')
              .fontSize(12)
              .fontColor('#BBBBBB')
              .width('100%')
              .textAlign(TextAlign.Center)
              .padding(12)
          }
        } else {
          ForEach(this.tasksOf(q.key), (t: Task) => {
            ListItem() {
              this.taskRow(t)
            }
          }, (t: Task) => t.id)
        }
      }
      .layoutWeight(1)
      .width('100%')
      .scrollBar(BarState.Off)

      Button('+ 添加任务')
        .fontSize(12)
        .height(32)
        .width('100%')
        .backgroundColor(tintOf(q.color))
        .fontColor(q.color)
        .margin({ bottom: 8 })
        .onClick(() => {
          this.openCreate(q.key);
        })
    }
    .width('100%')
    .height('100%')
    .borderRadius(12)
    .backgroundColor('#FFFFFF')
    .padding(4)
  }

  @Builder
  header() {
    Row({ space: 8 }) {
      Text('任务四象限')
        .fontSize(18)
        .fontWeight(FontWeight.Bold)
        .fontColor('#222222')
        .layoutWeight(1)
      Row({ space: 4 }) {
        Circle()
          .width(7)
          .height(7)
          .fill(this.connected ? '#2EBB6E' : '#E5484D')
        Text(this.connected ? '已连接' : (this.hasServer ? '未连接' : '未配置'))
          .fontSize(12)
          .fontColor(this.connected ? '#2EBB6E' : '#E5484D')
      }
      Button('设置')
        .fontSize(13)
        .height(32)
        .backgroundColor('#EAF2FF')
        .fontColor('#2F6BFF')
        .onClick(() => {
          router.pushUrl({ url: 'pages/SettingsPage' });
        })
    }
    .width('100%')
    .padding({ left: 16, right: 16, top: 12, bottom: 12 })
    .backgroundColor('#FFFFFF')
  }

  @Builder
  bottomNav() {
    Row() {
      ForEach([0, 1, 2], (i: number) => {
        Text(i === 0 ? '四象限' : (i === 1 ? '列表' : '归档'))
          .fontSize(14)
          .fontWeight(this.view === i ? FontWeight.Bold : FontWeight.Normal)
          .fontColor(this.view === i ? '#2F6BFF' : '#888888')
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
          .height(46)
          .onClick(() => {
            this.switchView(i);
          })
      }, (i: number) => i.toString())
    }
    .width('100%')
    .backgroundColor('#FFFFFF')
    .border({ width: { top: 1 }, color: '#EEEEEE' })
  }

  build() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      Column() {
        this.header()

        if (this.view === 0) {
          Column() {
            if (this.loading && this.tasks.length === 0) {
              LoadingProgress()
                .width(40)
                .height(40)
                .margin({ top: 120 })
            } else if (this.errorText) {
              Column({ space: 10 }) {
                Text(this.errorText)
                  .fontSize(14)
                  .fontColor('#888888')
                  .textAlign(TextAlign.Center)
                Button('去设置')
                  .height(36)
                  .backgroundColor('#EAF2FF')
                  .fontColor('#2F6BFF')
                  .onClick(() => {
                    router.pushUrl({ url: 'pages/SettingsPage' });
                  })
              }
              .width('100%')
              .margin({ top: 80 })
            } else {
              Grid() {
                ForEach(QUADRANTS, (q: QuadrantMeta) => {
                  GridItem() {
                    this.quadrantCard(q)
                  }
                  .margin(6)
                }, (q: QuadrantMeta) => q.key)
              }
              .columnsTemplate('1fr 1fr')
              .rowsTemplate('1fr 1fr')
              .width('100%')
              .height('100%')
              .padding(6)
            }
          }
          .layoutWeight(1)
          .width('100%')
        } else if (this.view === 1) {
          Column({ space: 8 }) {
            if (this.loading && this.tasks.length === 0) {
              LoadingProgress()
                .width(40)
                .height(40)
                .margin({ top: 120 })
            } else if (this.errorText) {
              Text(this.errorText)
                .fontSize(14)
                .fontColor('#888888')
                .margin({ top: 80 })
            } else if (this.activeTasks().length === 0) {
              Column({ space: 8 }) {
                Text('🗒️')
                  .fontSize(36)
                Text('暂无未完成任务')
                  .fontSize(14)
                  .fontColor('#888888')
              }
              .width('100%')
              .margin({ top: 80 })
            } else {
              List({ space: 6 }) {
                ForEach(this.activeTasks(), (t: Task) => {
                  ListItem() {
                    Column() {
                      this.taskRow(t)
                      Divider()
                        .strokeWidth(0.5)
                        .color('#F0F0F0')
                    }
                    .backgroundColor('#FFFFFF')
                    .borderRadius(12)
                  }
                }, (t: Task) => t.id)
              }
              .layoutWeight(1)
              .width('100%')
              .padding({ left: 10, right: 10 })
              .scrollBar(BarState.Off)
            }
          }
          .layoutWeight(1)
          .width('100%')
          .padding({ top: 8 })
        } else {
          Column({ space: 8 }) {
            Row({ space: 0 }) {
              ForEach([0, 1, 2], (i: number) => {
                Text(PERIOD_LABELS[i])
                  .fontSize(14)
                  .fontWeight(this.archivePeriod === i ? FontWeight.Bold : FontWeight.Normal)
                  .fontColor(this.archivePeriod === i ? '#2F6BFF' : '#888888')
                  .layoutWeight(1)
                  .textAlign(TextAlign.Center)
                  .padding({ top: 10, bottom: 10 })
                  .onClick(() => {
                    this.selectPeriod(i);
                  })
              }, (i: number) => i.toString())
            }
            .width('100%')
            .backgroundColor('#FFFFFF')
            .borderRadius(10)

            Text(PERIOD_LABELS[this.archivePeriod] + '已完成 ' + this.archiveTasks.length.toString() + ' 项')
              .fontSize(13)
              .fontColor('#888888')
              .width('100%')
              .padding({ left: 4 })

            if (this.archiveLoading && this.archiveTasks.length === 0) {
              LoadingProgress()
                .width(40)
                .height(40)
                .margin({ top: 80 })
            } else if (this.archiveTasks.length === 0) {
              Column({ space: 8 }) {
                Text('📦')
                  .fontSize(36)
                Text(PERIOD_LABELS[this.archivePeriod] + '暂无已完成任务')
                  .fontSize(14)
                  .fontColor('#888888')
              }
              .width('100%')
              .margin({ top: 60 })
            } else {
              List({ space: 6 }) {
                ForEach(this.archiveTasks, (t: Task) => {
                  ListItem() {
                    Column({ space: 4 }) {
                      Row({ space: 8 }) {
                        Text(t.title)
                          .fontSize(14)
                          .fontColor('#555555')
                          .decoration({ type: TextDecorationType.LineThrough, color: '#AAAAAA' })
                          .layoutWeight(1)
                          .maxLines(2)
                          .textOverflow({ overflow: TextOverflow.Ellipsis })
                      }
                      .width('100%')
                      Row({ space: 6 }) {
                        Text(quadrantMeta(t.quadrant).label)
                          .fontSize(11)
                          .fontColor(quadrantMeta(t.quadrant).color)
                          .padding({ left: 6, right: 6, top: 2, bottom: 2 })
                          .borderRadius(4)
                          .backgroundColor(tintOf(quadrantMeta(t.quadrant).color))
                        Text('完成于 ' + formatDisplay(t.completedAt))
                          .fontSize(11)
                          .fontColor('#888888')
                        Blank()
                        Button('恢复')
                          .fontSize(11)
                          .height(26)
                          .backgroundColor('#EAF2FF')
                          .fontColor('#2F6BFF')
                          .onClick(() => {
                            this.restore(t);
                          })
                        Button('删除')
                          .fontSize(11)
                          .height(26)
                          .backgroundColor('#FDECEC')
                          .fontColor('#E5484D')
                          .onClick(() => {
                            this.removeArchived(t);
                          })
                      }
                      .width('100%')
                    }
                    .width('100%')
                    .padding(12)
                    .backgroundColor('#FFFFFF')
                    .borderRadius(12)
                  }
                }, (t: Task) => t.id)
              }
              .layoutWeight(1)
              .width('100%')
              .scrollBar(BarState.Off)
            }
          }
          .layoutWeight(1)
          .width('100%')
          .padding({ left: 10, right: 10, top: 8 })
        }

        this.bottomNav()
      }
      .width('100%')
      .height('100%')
      .backgroundColor('#F5F6F8')

      Button('+')
        .fontSize(26)
        .width(56)
        .height(56)
        .borderRadius(28)
        .backgroundColor('#2F6BFF')
        .fontColor('#FFFFFF')
        .margin({ right: 20, bottom: 70 })
        .shadow({ radius: 8, color: '#332F6BFF', offsetX: 0, offsetY: 3 })
        .onClick(() => {
          this.openCreate('IU');
        })
    }
    .width('100%')
    .height('100%')
  }
}
