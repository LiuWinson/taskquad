// 提醒对账：任务列表同步后，为未完成任务发布系统定时提醒（reminderAgentManager）
import reminderAgentManager from '@ohos.reminderAgentManager';
import abilityAccessCtrl from '@ohos.abilityAccessCtrl';
import common from '@ohos.app.ability.common';
import { Task } from './Task';

export class Reminders {
  static async requestPermission(context: common.UIAbilityContext): Promise<void> {
    try {
      const atManager = abilityAccessCtrl.createAtManager();
      await atManager.requestPermissionsFromUser(context, ['ohos.permission.PUBLISH_AGENT_REMINDER']);
    } catch (e) {
      // 权限已授予或用户拒绝：静默继续，发布提醒时再容错
    }
  }

  /** 任务 id → 稳定的正整型 reminderId（< 2^31） */
  static hashIdToInt(id: string): number {
    let h: number = 5381;
    for (let i = 0; i < id.length; i++) {
      h = ((h * 33) + id.charCodeAt(i)) % 2147483647;
    }
    return h;
  }

  static async reconcile(tasks: Task[]): Promise<void> {
    const nowSeconds: number = Math.floor(Date.now() / 1000);
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const reminderId: number = Reminders.hashIdToInt(t.id);
      if (t.completed || !t.remindAt) {
        try {
          await reminderAgentManager.cancelReminder(reminderId);
        } catch (e) {
          // 不存在的提醒 id：忽略
        }
        continue;
      }
      const triggerSeconds: number = Math.floor(new Date(t.remindAt).getTime() / 1000);
      if (Number.isNaN(triggerSeconds) || triggerSeconds <= nowSeconds) {
        try {
          await reminderAgentManager.cancelReminder(reminderId);
        } catch (e) {
          // 忽略
        }
        continue;
      }
      try {
        // 先取消同 id 旧提醒，再以固定 reminderId 发布，保证对账幂等、不重复
        await reminderAgentManager.cancelReminder(reminderId);
      } catch (e) {
        // 不存在的提醒 id：忽略
      }
      try {
        const timer: reminderAgentManager.ReminderRequestTimer = {
          reminderType: reminderAgentManager.ReminderType.REMINDER_TYPE_TIMER,
          triggerTimeInSeconds: triggerSeconds,
          reminderId: reminderId,
          title: '任务提醒',
          content: t.title
        };
        await reminderAgentManager.publishReminder(timer);
      } catch (e) {
        // 发布失败（无权限等）：下次对账重试
      }
    }
  }
}
