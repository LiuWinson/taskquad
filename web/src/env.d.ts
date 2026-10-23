/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface Window {
  desktop?: {
    isDesktop: boolean;
    electronVersion: string;
    onWindowShown?: (cb: () => void) => void;
    /** 系统级提醒：系统通知 + 右下角置顶小窗 */
    alert?: (payload: { title: string; body: string; icon?: string }) => void;
  };
}
