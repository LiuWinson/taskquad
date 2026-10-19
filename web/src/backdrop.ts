/**
 * 遮罩层点击关闭（模态框通用）。
 *
 * 为什么不用 @click.self：鼠标在对话框内的输入框/文本域里拖拽选择文本、
 * 松开时若指针已移到遮罩上，浏览器会把 click 事件派发到「按下与松开的共同祖先」，
 * 恰好是遮罩本身 → @click.self 命中 → 对话框被误关闭（选个 API Key 就关了窗口）。
 *
 * 正确做法：只有「按下」和「松开」都发生在遮罩本身时才关闭。
 * 用法：
 *   const backdrop = useBackdropClose(() => emit('close'));
 *   <div class="modal-overlay" @mousedown="backdrop.onBackdropDown" @mouseup="backdrop.onBackdropUp">
 */
export interface BackdropHandlers {
  onBackdropDown: (e: MouseEvent) => void;
  onBackdropUp: (e: MouseEvent) => void;
}

export function useBackdropClose(close: () => void): BackdropHandlers {
  let pressedOnBackdrop = false;

  function onBackdropDown(e: MouseEvent): void {
    pressedOnBackdrop = e.target === e.currentTarget;
  }

  function onBackdropUp(e: MouseEvent): void {
    const shouldClose = pressedOnBackdrop && e.target === e.currentTarget;
    pressedOnBackdrop = false;
    if (shouldClose) close();
  }

  return { onBackdropDown, onBackdropUp };
}
