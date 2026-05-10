/**
 * Native bridge interface for communicating with Swift/Obj-C code.
 * In a real Safari Web Extension, this communicates with the native app
 * via browser.runtime.sendNativeMessage.
 */

export interface NativeBridgeMessage {
  type: "reload" | "update" | "getStatus";
  payload?: unknown;
}

export interface NativeBridgeResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Send a message to the native (Swift) side of the Safari extension.
 */
export async function sendNativeMessage(
  message: NativeBridgeMessage,
): Promise<NativeBridgeResponse> {
  // In a real implementation, this would use browser.runtime.sendNativeMessage
  // or the Safari-specific messaging API
  void message;
  return { success: true };
}

/**
 * Request the native side to reload the content blocker rules.
 */
export async function reloadContentBlocker(identifier: string): Promise<void> {
  await sendNativeMessage({
    type: "reload",
    payload: { identifier },
  });
}

/**
 * Get the current status of the content blocker from the native side.
 */
export async function getContentBlockerStatus(): Promise<{
  enabled: boolean;
  rulesCount: number;
}> {
  const response = await sendNativeMessage({ type: "getStatus" });
  return (response.data as { enabled: boolean; rulesCount: number }) ?? {
    enabled: false,
    rulesCount: 0,
  };
}
