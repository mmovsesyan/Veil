declare const browser: any;

/**
 * Native bridge interface for communicating with Swift/Obj-C code.
 * In a Safari Web Extension, this communicates with the native app
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

/** The native application identifier for the Veil Safari extension. */
const NATIVE_APP_ID = "com.veil.app";

/**
 * Send a message to the native (Swift) side of the Safari extension.
 */
export async function sendNativeMessage(
  message: NativeBridgeMessage,
): Promise<NativeBridgeResponse> {
  try {
    if (typeof browser !== "undefined" && browser?.runtime?.sendNativeMessage) {
      const response = await browser.runtime.sendNativeMessage(NATIVE_APP_ID, message);
      return response as NativeBridgeResponse;
    }
    // Fallback: native messaging not available (e.g., running in tests or unsupported context)
    return { success: false, error: "Native messaging API not available" };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown native bridge error";
    return { success: false, error: errorMessage };
  }
}

/**
 * Request the native side to reload the content blocker rules.
 */
export async function reloadContentBlocker(identifier: string): Promise<void> {
  const response = await sendNativeMessage({
    type: "reload",
    payload: { identifier },
  });

  if (!response.success) {
    throw new Error(
      `Failed to reload content blocker: ${response.error ?? "unknown error"}`,
    );
  }
}

/**
 * Get the current status of the content blocker from the native side.
 */
export async function getContentBlockerStatus(): Promise<{
  enabled: boolean;
  rulesCount: number;
}> {
  const response = await sendNativeMessage({ type: "getStatus" });

  if (!response.success || !response.data) {
    // Return a safe default when native app is not available
    return { enabled: false, rulesCount: 0 };
  }

  return response.data as { enabled: boolean; rulesCount: number };
}
