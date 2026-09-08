// 本地偏好设置：服务器地址（Preferences 持久化）
import dataPreferences from '@ohos.data.preferences';
import common from '@ohos.app.ability.common';

const PREF_NAME: string = 'taskquad';
const KEY_SERVER_URL: string = 'serverUrl';

export class AppSettings {
  private static prefs: dataPreferences.Preferences | null = null;

  static async init(context: common.UIAbilityContext): Promise<void> {
    if (AppSettings.prefs) {
      return;
    }
    AppSettings.prefs = await dataPreferences.getPreferences(context, PREF_NAME);
  }

  static async getServerUrl(): Promise<string> {
    if (!AppSettings.prefs) {
      return '';
    }
    const value = await AppSettings.prefs.get(KEY_SERVER_URL, '');
    return value as string;
  }

  static async setServerUrl(url: string): Promise<void> {
    if (!AppSettings.prefs) {
      return;
    }
    await AppSettings.prefs.put(KEY_SERVER_URL, url);
    await AppSettings.prefs.flush();
  }
}
