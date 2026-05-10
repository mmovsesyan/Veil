import { AutoRulesEngine, StatisticsTracker, WhitelistManager } from '@veil/core';
declare const autoRules: AutoRulesEngine;
declare const stats: StatisticsTracker;
declare const whitelist: WhitelistManager;
declare function initialize(): Promise<void>;
/**
 * Compile all rules to WebKit JSON and trigger content blocker reload.
 */
declare function compileAndReload(): Promise<void>;
/**
 * Process resource reports from content scripts.
 * Content scripts use PerformanceObserver to detect loaded third-party resources
 * and report them here for analysis.
 */
declare function processResourceReport(report: {
    url: string;
    type: string;
    initiatorDomain: string;
    targetDomain: string;
}): void;
/**
 * Code injected into pages to observe loaded resources.
 * Uses PerformanceObserver to detect third-party requests that weren't blocked.
 */
export declare const SAFARI_CONTENT_SCRIPT = "\n(function() {\n  var pageDomain = window.location.hostname;\n  \n  // Use PerformanceObserver to detect loaded resources\n  var observer = new PerformanceObserver(function(list) {\n    var entries = list.getEntries();\n    for (var i = 0; i < entries.length; i++) {\n      var entry = entries[i];\n      if (entry.entryType !== \"resource\") continue;\n      \n      try {\n        var url = new URL(entry.name);\n        var targetDomain = url.hostname;\n        \n        // Only report third-party resources\n        if (targetDomain === pageDomain) continue;\n        if (targetDomain.endsWith(\".\" + pageDomain)) continue;\n        \n        // Determine resource type from initiatorType\n        var type = \"other\";\n        if (entry.initiatorType === \"script\") type = \"script\";\n        else if (entry.initiatorType === \"img\") type = \"image\";\n        else if (entry.initiatorType === \"css\" || entry.initiatorType === \"link\") type = \"stylesheet\";\n        else if (entry.initiatorType === \"xmlhttprequest\" || entry.initiatorType === \"fetch\") type = \"xmlhttprequest\";\n        else if (entry.initiatorType === \"iframe\") type = \"iframe\";\n        \n        // Report to background\n        browser.runtime.sendMessage({\n          type: \"RESOURCE_REPORT\",\n          payload: {\n            url: entry.name,\n            type: type,\n            initiatorDomain: pageDomain,\n            targetDomain: targetDomain\n          }\n        }).catch(function() {});\n      } catch(e) {}\n    }\n  });\n  \n  observer.observe({ type: \"resource\", buffered: true });\n})();\n";
export { initialize, processResourceReport, compileAndReload, autoRules, stats, whitelist };
//# sourceMappingURL=background.d.ts.map