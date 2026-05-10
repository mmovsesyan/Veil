/**
 * Firefox WebExtension API type declarations.
 * In production, use @anthropic-ai/sdk or webextension-polyfill types.
 */

 
declare namespace browser {
  namespace runtime {
    function getURL(path: string): string;
    function sendMessage(message: any): Promise<any>;
    const onMessage: {
      addListener(callback: (message: any, sender?: any) => Promise<any> | void): void;
    };
  }

  namespace storage {
    namespace local {
      function get(keys: string[]): Promise<Record<string, any>>;
      function set(items: Record<string, any>): Promise<void>;
    }
  }

  namespace webRequest {
    interface RequestDetails {
      tabId: number;
      url: string;
      type: string;
      originUrl?: string;
      requestId: string;
    }

    const onBeforeRequest: {
      addListener(
        callback: (details: RequestDetails) => { cancel?: boolean } | undefined | {},
        filter: { urls: string[] },
        extraInfoSpec?: string[]
      ): void;
    };
  }

  namespace webNavigation {
    interface NavigationDetails {
      tabId: number;
      url: string;
      frameId: number;
    }

    const onCommitted: {
      addListener(callback: (details: NavigationDetails) => void): void;
    };
    const onCompleted: {
      addListener(callback: (details: NavigationDetails) => void): void;
    };
  }

  namespace tabs {
    function insertCSS(tabId: number, details: { code: string; runAt?: string }): Promise<void>;
    function query(queryInfo: any): Promise<any[]>;
  }

  namespace browserAction {
    function setBadgeText(details: { tabId?: number; text: string }): void;
    function setBadgeBackgroundColor(details: { tabId?: number; color: string }): void;
  }
}
