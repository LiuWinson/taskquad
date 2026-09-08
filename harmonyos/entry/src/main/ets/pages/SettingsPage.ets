// 设置页：服务器地址配置、测试连接、使用说明
import promptAction from '@ohos.promptAction';
import router from '@ohos.router';
import common from '@ohos.app.ability.common';
import { AppSettings } from '../model/Settings';
import { Api } from '../model/Api';

@Entry
@Component
struct SettingsPage {
  @State url: string = '';
  @State testing: boolean = false;
  @State statusText: string = '尚未测试';
  @State statusOk: boolean = false;
  private ctx: common.UIAbilityContext | null = null;

  aboutToAppear(): void {
    this.ctx = getContext(this) as common.UIAbilityContext;
    this.loadPrefs();
  }

  async loadPrefs(): Promise<void> {
    if (this.ctx) {
      await AppSettings.init(this.ctx);
    }
    const v = await AppSettings.getServerUrl();
    this.url = v;
  }

  async save(): Promise<void> {
    const u = this.url.trim();
    if (!u) {
      promptAction.showToast({ message: '地址不能为空' });
      return;
    }
    await AppSettings.setServerUrl(u);
    promptAction.showToast({ message: '已保存' });
  }

  async test(): Promise<void> {
    const u = this.url.trim();
    if (!u) {
      promptAction.showToast({ message: '请先填写服务器地址' });
      return;
    }
    this.testing = true;
    const ok = await Api.healthWith(u);
    this.testing = false;
    if (ok) {
      this.statusOk = true;
      this.statusText = '连接成功 ✓';
      promptAction.showToast({ message: '连接成功' });
    } else {
      this.statusOk = false;
      this.statusText = '连接失败：' + Api.lastError;
      promptAction.showToast({ message: '连接失败，请检查地址与网络' });
    }
  }

  build() {
    Column({ space: 14 }) {
      Row({ space: 8 }) {
        Button('←')
          .fontSize(18)
          .width(40)
          .height(40)
          .backgroundColor('#FFFFFF')
          .fontColor('#333333')
          .onClick(() => {
            router.back();
          })
        Text('设置')
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .fontColor('#222222')
          .layoutWeight(1)
      }
      .width('100%')
      .padding({ left: 8, right: 16, top: 10, bottom: 4 })

      Column({ space: 10 }) {
        Text('服务器地址')
          .fontSize(14)
          .fontColor('#666666')
          .width('100%')
        TextInput({ placeholder: 'http://192.168.1.100:8788', text: this.url })
          .height(44)
          .fontSize(14)
          .onChange((value: string) => {
            this.url = value;
          })
        Row({ space: 10 }) {
          Button('保存')
            .fontSize(14)
            .height(38)
            .layoutWeight(1)
            .backgroundColor('#2F6BFF')
            .fontColor('#FFFFFF')
            .onClick(() => {
              this.save();
            })
          Button(this.testing ? '测试中…' : '测试连接')
            .fontSize(14)
            .height(38)
            .layoutWeight(1)
            .backgroundColor('#EAF2FF')
            .fontColor('#2F6BFF')
            .onClick(() => {
              this.test();
            })
        }
        .width('100%')

        if (this.statusText.length > 0) {
          Text(this.statusText)
            .fontSize(13)
            .fontColor(this.statusOk ? '#2EBB6E' : '#E5484D')
            .width('100%')
        }
      }
      .width('100%')
      .padding(16)
      .borderRadius(12)
      .backgroundColor('#FFFFFF')

      Column({ space: 8 }) {
        Text('使用说明')
          .fontSize(14)
          .fontWeight(FontWeight.Bold)
          .fontColor('#333333')
          .width('100%')
        Text('1. 在 Windows 电脑上启动「任务四象限」桌面应用。')
          .fontSize(13)
          .fontColor('#666666')
          .width('100%')
        Text('2. 电脑端右上角「设置」中查看局域网地址（如 http://192.168.1.100:8788）。')
          .fontSize(13)
          .fontColor('#666666')
          .width('100%')
        Text('3. 手机与电脑连接同一 WiFi，在此填入该地址并保存、测试。')
          .fontSize(13)
          .fontColor('#666666')
          .width('100%')
        Text('4. 若连接失败：确认电脑防火墙已放行 8788 端口，且电脑端应用处于运行状态。')
          .fontSize(13)
          .fontColor('#666666')
          .width('100%')
        Text('5. 任务提醒由本机系统调度：保持一次成功同步后，即使 App 关闭也会按时提醒。')
          .fontSize(13)
          .fontColor('#666666')
          .width('100%')
      }
      .width('100%')
      .padding(16)
      .borderRadius(12)
      .backgroundColor('#FFFFFF')
      .alignItems(HorizontalAlign.Start)
    }
    .width('100%')
    .height('100%')
    .padding({ left: 12, right: 12 })
    .backgroundColor('#F5F6F8')
  }
}
