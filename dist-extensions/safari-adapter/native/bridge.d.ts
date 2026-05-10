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
export declare function sendNativeMessage(message: NativeBridgeMessage): Promise<NativeBridgeResponse>;
/**
 * Request the native side to reload the content blocker rules.
 */
export declare function reloadContentBlocker(identifier: string): Promise<void>;
/**
 * Get the current status of the content blocker from the native side.
 */
export declare function getContentBlockerStatus(): Promise<{
    enabled: boolean;
    rulesCount: number;
}>;
//# sourceMappingURL=bridge.d.ts.map