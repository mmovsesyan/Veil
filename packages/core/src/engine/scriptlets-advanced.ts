/**
 * Advanced scriptlets — response modification, timing adjustments, CSS spoofing.
 * These handle the most sophisticated anti-adblock techniques.
 */

type ScriptletFn = (...args: string[]) => string;

export const ADVANCED_SCRIPTLETS: Record<string, ScriptletFn> = {
  /**
   * Modify fetch responses to remove ad-detection code.
   */
  "trusted-replace-fetch-response": (pattern: string, replacement: string, urlMatch: string) => `
(function() {
  var origFetch = window.fetch;
  window.fetch = function() {
    var url = arguments[0];
    var urlStr = typeof url === "string" ? url : (url && url.url) || "";
    if ("${urlMatch}" && !urlStr.includes("${urlMatch}")) {
      return origFetch.apply(this, arguments);
    }
    return origFetch.apply(this, arguments).then(function(response) {
      return response.text().then(function(text) {
        var modified = text.replace(new RegExp(${JSON.stringify(pattern)}, "g"), ${JSON.stringify(replacement)});
        return new Response(modified, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      });
    });
  };
})();
`,

  /**
   * Modify XHR responses.
   */
  "trusted-replace-xhr-response": (pattern: string, replacement: string, urlMatch: string) => `
(function() {
  var origOpen = XMLHttpRequest.prototype.open;
  var origGetter = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText");
  var targets = new WeakMap();

  XMLHttpRequest.prototype.open = function(method, url) {
    if ("${urlMatch}" && String(url).includes("${urlMatch}")) {
      targets.set(this, true);
    }
    return origOpen.apply(this, arguments);
  };

  if (origGetter && origGetter.get) {
    Object.defineProperty(XMLHttpRequest.prototype, "responseText", {
      get: function() {
        var text = origGetter.get.call(this);
        if (targets.has(this) && text) {
          return text.replace(new RegExp(${JSON.stringify(pattern)}, "g"), ${JSON.stringify(replacement)});
        }
        return text;
      }
    });
  }
})();
`,

  /**
   * Adjust setTimeout delay (speed up or slow down).
   */
  "adjust-setTimeout": (match: string, newDelay: string) => `
(function() {
  var origSetTimeout = window.setTimeout;
  window.setTimeout = function(fn, delay) {
    var s = typeof fn === "function" ? fn.toString() : String(fn);
    if ("${match}" === "" || s.includes("${match}")) {
      arguments[1] = ${newDelay || "0"};
    }
    return origSetTimeout.apply(this, arguments);
  };
})();
`,

  /**
   * Adjust setInterval delay.
   */
  "adjust-setInterval": (match: string, newDelay: string) => `
(function() {
  var origSetInterval = window.setInterval;
  window.setInterval = function(fn, delay) {
    var s = typeof fn === "function" ? fn.toString() : String(fn);
    if ("${match}" === "" || s.includes("${match}")) {
      arguments[1] = ${newDelay || "1000"};
    }
    return origSetInterval.apply(this, arguments);
  };
})();
`,

  /**
   * Spoof CSS computed style values.
   * Used to bypass anti-adblock that checks if ad elements are hidden.
   */
  "spoof-css": (selector: string, property: string, value: string) => `
(function() {
  var origGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function(el, pseudo) {
    var style = origGetComputedStyle.call(this, el, pseudo);
    try {
      if (el.matches("${selector}")) {
        return new Proxy(style, {
          get: function(target, prop) {
            if (prop === "${property}") return "${value}";
            if (prop === "getPropertyValue") {
              return function(p) {
                if (p === "${property}") return "${value}";
                return target.getPropertyValue(p);
              };
            }
            var val = target[prop];
            return typeof val === "function" ? val.bind(target) : val;
          }
        });
      }
    } catch(e) {}
    return style;
  };
})();
`,

  /**
   * Prevent window.open popups and popunders.
   */
  "nowoif": (match: string) => `
(function() {
  var origOpen = window.open;
  var count = 0;
  window.open = function(url) {
    if ("${match}" === "" || (url && String(url).includes("${match}"))) {
      count++;
      return null;
    }
    return origOpen.apply(this, arguments);
  };
})();
`,

  /**
   * Prevent history.pushState/replaceState manipulation.
   */
  "prevent-history": (match: string) => `
(function() {
  var origPush = history.pushState;
  var origReplace = history.replaceState;
  history.pushState = function(state, title, url) {
    if ("${match}" && url && String(url).includes("${match}")) return;
    return origPush.apply(this, arguments);
  };
  history.replaceState = function(state, title, url) {
    if ("${match}" && url && String(url).includes("${match}")) return;
    return origReplace.apply(this, arguments);
  };
})();
`,

  /**
   * Override IntersectionObserver (used for lazy-loading ad detection).
   */
  "no-intersectionObserver": () => `
(function() {
  window.IntersectionObserver = function(cb) {
    this.observe = function() {};
    this.unobserve = function() {};
    this.disconnect = function() {};
  };
})();
`,

  /**
   * Prevent requestAnimationFrame from running matching callbacks.
   */
  "no-requestAnimationFrame-if": (match: string) => `
(function() {
  var origRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function(fn) {
    var s = typeof fn === "function" ? fn.toString() : "";
    if ("${match}" === "" || s.includes("${match}")) return 0;
    return origRAF.call(this, fn);
  };
})();
`,

  /**
   * Abort script execution when a specific string is found in script content.
   */
  "abort-current-inline-script": (property: string, search: string) => `
(function() {
  var magic = "${search}";
  var prop = "${property}";
  var owner = window;
  var props = prop.split(".");
  for (var i = 0; i < props.length - 1; i++) {
    owner = owner[props[i]];
    if (!owner) return;
  }
  var lastProp = props[props.length - 1];
  var orig = owner[lastProp];
  Object.defineProperty(owner, lastProp, {
    get: function() {
      if (magic) {
        var e = new Error();
        if (e.stack && e.stack.includes(magic)) {
          throw new ReferenceError("blocked by content blocker");
        }
      }
      return orig;
    },
    set: function(v) { orig = v; }
  });
})();
`,

  /**
   * Simulate ad loaded event to bypass anti-adblock checks.
   */
  "simulate-ad-loaded": (eventName: string) => `
(function() {
  window.addEventListener("DOMContentLoaded", function() {
    setTimeout(function() {
      var event = new CustomEvent("${eventName || "ad_loaded"}", { detail: { loaded: true } });
      document.dispatchEvent(event);
      window.dispatchEvent(event);
    }, 100);
  });
})();
`,

  /**
   * Override MutationObserver to prevent anti-adblock DOM monitoring.
   */
  "prevent-MutationObserver": (match: string) => `
(function() {
  var origMO = window.MutationObserver;
  window.MutationObserver = function(cb) {
    var s = cb.toString();
    if ("${match}" === "" || s.includes("${match}")) {
      this.observe = function() {};
      this.disconnect = function() {};
      this.takeRecords = function() { return []; };
      return;
    }
    return new origMO(cb);
  };
  window.MutationObserver.prototype = origMO.prototype;
})();
`,

  /**
   * Spoof Performance API timing (anti-fingerprinting).
   */
  "performance-timing-spoof": () => `
(function() {
  var offset = Math.floor(Math.random() * 50);
  var origNow = Performance.prototype.now;
  Performance.prototype.now = function() {
    return Math.round(origNow.call(this) + offset);
  };
})();
`,

  /**
   * Block Beacon API (tracking pings).
   */
  "no-beacon": (match: string) => `
(function() {
  var origBeacon = Navigator.prototype.sendBeacon;
  Navigator.prototype.sendBeacon = function(url) {
    if ("${match}" === "" || String(url).includes("${match}")) return true;
    return origBeacon.apply(this, arguments);
  };
})();
`,

  /**
   * Prevent Service Worker registration (used by some trackers).
   */
  "prevent-serviceWorker": () => `
(function() {
  if (navigator.serviceWorker) {
    Object.defineProperty(navigator, "serviceWorker", {
      get: function() {
        return { register: function() { return Promise.reject(); }, ready: Promise.reject() };
      }
    });
  }
})();
`,
};
