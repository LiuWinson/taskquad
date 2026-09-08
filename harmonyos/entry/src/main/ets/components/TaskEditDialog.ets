// 新建/编辑任务对话框（CustomDialog）
import promptAction from '@ohos.promptAction';
import { Task, QUADRANTS, QuadrantMeta, tintOf, formatDisplay } from '../model/Task';
import { TaskCreate } from '../model/Api';

@CustomDialog
export struct TaskEditDialog {
  controller?: CustomDialogController;
  task: Task | null = null;
  defaultQuadrant: string = 'IU';
  onSave: (payload: TaskCreate) => void = (payload: TaskCreate): void => {};
  onDelete: (id: string) => void = (id: string): void => {};

  @State title: string = '';
  @State note: string = '';
  @State quadrant: string = 'IU';
  @State dueAt: string = '';
  @State remindAt: string = '';
  @State editId: string = '';
  private picking: string = '';

  aboutToAppear(): void {
    const t = this.task;
    if (t) {
      this.editId = t.id;
      this.title = t.title;
      this.note = t.note;
      this.quadrant = t.quadrant;
      this.dueAt = t.dueAt ? t.dueAt : '';
      this.remindAt = t.remindAt ? t.remindAt : '';
    } else {
      this.quadrant = this.defaultQuadrant;
    }
  }

  quickRemind(ms: number): void {
    if (!this.dueAt) {
      promptAction.showToast({ message: '请先设置完成时间' });
      return;
    }
    const base = new Date(this.dueAt).getTime();
    if (Number.isNaN(base)) {
      promptAction.showToast({ message: '完成时间无效' });
      return;
    }
    this.remindAt = new Date(base - ms).toISOString();
  }

  pickDateTime(which: string): void {
    this.picking = which;
    const current = which === 'due' ? this.dueAt : this.remindAt;
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    let day = now.getDate();
    if (current) {
      const d = new Date(current);
      if (!Number.isNaN(d.getTime())) {
        year = d.getFullYear();
        month = d.getMonth();
        day = d.getDate();
      }
    }
    DatePickerDialog.show({
      start: new Date(2020, 0, 1),
      end: new Date(2035, 11, 31),
      selected: new Date(year, month, day),
      onDateAccept: (value: Date): void => {
        let hour = 9;
        let minute = 0;
        if (current) {
          const d = new Date(current);
          if (!Number.isNaN(d.getTime())) {
            hour = d.getHours();
            minute = d.getMinutes();
          }
        }
        TimePickerDialog.show({
          selected: new Date(2000, 0, 1, hour, minute),
          onTimeAccept: (time: TimePickerResult): void => {
            const dt = new Date(value.getFullYear(), value.getMonth(), value.getDate(), time.hour, time.minute);
            const iso = dt.toISOString();
            if (this.picking === 'due') {
              this.dueAt = iso;
            } else {
              this.remindAt = iso;
            }
          }
        });
      }
    });
  }

  save(): void {
    const t = this.title.trim();
    if (!t) {
      promptAction.showToast({ message: '标题不能为空' });
      return;
    }
    this.onSave(new TaskCreate(t, this.note, this.quadrant, this.dueAt ? this.dueAt : null, this.remindAt ? this.remindAt : null));
    if (this.controller) {
      this.controller.close();
    }
  }

  @Builder
  quadrantCell(q: QuadrantMeta) {
    Row() {
      Text(q.label)
        .fontSize(13)
        .fontColor(this.quadrant === q.key ? q.color : '#333333')
        .fontWeight(this.quadrant === q.key ? FontWeight.Bold : FontWeight.Normal)
        .layoutWeight(1)
        .textAlign(TextAlign.Center)
    }
    .height(38)
    .margin(4)
    .borderRadius(8)
    .border({ width: 1, color: this.quadrant === q.key ? q.color : '#E0E0E0' })
    .backgroundColor(this.quadrant === q.key ? tintOf(q.color) : '#FFFFFF')
    .onClick(() => {
      this.quadrant = q.key;
    })
  }

  build() {
    Column({ space: 10 }) {
      Text(this.editId.length > 0 ? '编辑任务' : '新建任务')
        .fontSize(18)
        .fontWeight(FontWeight.Bold)
        .fontColor('#222222')
        .width('100%')
        .textAlign(TextAlign.Center)

      TextInput({ placeholder: '请输入任务标题', text: this.title })
        .height(44)
        .fontSize(15)
        .onChange((value: string) => {
          this.title = value;
        })

      TextArea({ placeholder: '备注（可选）', text: this.note })
        .height(72)
        .fontSize(14)
        .onChange((value: string) => {
          this.note = value;
        })

      Text('四象限')
        .fontSize(14)
        .fontColor('#666666')
        .width('100%')
      Grid() {
        ForEach(QUADRANTS, (q: QuadrantMeta) => {
          GridItem() {
            this.quadrantCell(q)
          }
        }, (q: QuadrantMeta) => q.key)
      }
      .columnsTemplate('1fr 1fr')
      .rowsTemplate('1fr 1fr')
      .height(100)
      .width('100%')

      Row() {
        Column({ space: 2 }) {
          Text('需要完成时间')
            .fontSize(13)
            .fontColor('#666666')
          Text(this.dueAt ? formatDisplay(this.dueAt) : '未设置')
            .fontSize(15)
            .fontColor(this.dueAt ? '#222222' : '#AAAAAA')
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        .onClick(() => {
          this.pickDateTime('due');
        })

        Button('清除')
          .fontSize(12)
          .height(28)
          .backgroundColor('#F0F0F0')
          .fontColor('#666666')
          .onClick(() => {
            this.dueAt = '';
            this.remindAt = '';
          })
      }
      .width('100%')
      .padding(10)
      .borderRadius(8)
      .backgroundColor('#F7F8FA')

      Column({ space: 6 }) {
        Row() {
          Column({ space: 2 }) {
            Text('提醒时间')
              .fontSize(13)
              .fontColor('#666666')
            Text(this.remindAt ? formatDisplay(this.remindAt) : '未设置')
              .fontSize(15)
              .fontColor(this.remindAt ? '#222222' : '#AAAAAA')
          }
          .alignItems(HorizontalAlign.Start)
          .layoutWeight(1)
          .onClick(() => {
            this.pickDateTime('remind');
          })

          Button('清除')
            .fontSize(12)
            .height(28)
            .backgroundColor('#F0F0F0')
            .fontColor('#666666')
            .onClick(() => {
              this.remindAt = '';
            })
        }
        .width('100%')

        Flex({ wrap: FlexWrap.Wrap }) {
          Button('截止前5分钟')
            .fontSize(11)
            .height(26)
            .margin(3)
            .backgroundColor('#EAF2FF')
            .fontColor('#3B82F6')
            .onClick(() => {
              this.quickRemind(5 * 60 * 1000);
            })
          Button('截止前15分钟')
            .fontSize(11)
            .height(26)
            .margin(3)
            .backgroundColor('#EAF2FF')
            .fontColor('#3B82F6')
            .onClick(() => {
              this.quickRemind(15 * 60 * 1000);
            })
          Button('截止前1小时')
            .fontSize(11)
            .height(26)
            .margin(3)
            .backgroundColor('#EAF2FF')
            .fontColor('#3B82F6')
            .onClick(() => {
              this.quickRemind(60 * 60 * 1000);
            })
          Button('截止前1天')
            .fontSize(11)
            .height(26)
            .margin(3)
            .backgroundColor('#EAF2FF')
            .fontColor('#3B82F6')
            .onClick(() => {
              this.quickRemind(24 * 60 * 60 * 1000);
            })
        }
        .width('100%')
      }
      .width('100%')
      .padding(10)
      .borderRadius(8)
      .backgroundColor('#F7F8FA')

      Row({ space: 10 }) {
        if (this.editId.length > 0) {
          Button('删除')
            .fontSize(14)
            .height(40)
            .layoutWeight(1)
            .backgroundColor('#FDECEC')
            .fontColor('#E5484D')
            .onClick(() => {
              this.onDelete(this.editId);
              if (this.controller) {
                this.controller.close();
              }
            })
        }
        Button('取消')
          .fontSize(14)
          .height(40)
          .layoutWeight(1)
          .backgroundColor('#F0F0F0')
          .fontColor('#666666')
          .onClick(() => {
            if (this.controller) {
              this.controller.close();
            }
          })
        Button('保存')
          .fontSize(14)
          .height(40)
          .layoutWeight(1)
          .backgroundColor('#2F6BFF')
          .fontColor('#FFFFFF')
          .onClick(() => {
            this.save();
          })
      }
      .width('100%')
    }
    .width('92%')
    .padding(16)
    .borderRadius(16)
    .backgroundColor('#FFFFFF')
  }
}
