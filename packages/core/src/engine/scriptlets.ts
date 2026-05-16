/**
 * Production scriptlet injection engine for anti-adblock bypass.
 * 
 * 35+ scriptlets covering the most common anti-adblock patterns found on
 * top websites. Compatible with AdGuard/uBlock Origin scriptlet syntax.
 * 
 * Usage in filter rules:
 *   example.com#%#//scriptlet("abort-on-property-read", "adblock")
 *   example.com#%#//scriptlet("set-constant", "ads_loaded", "true")
 *   example.com#%#//scriptlet("prevent-fetch", "ads")
 * 
 * Categories:
 * 1. Property manipulation (abort-on-read/write, set-constant)
 * 2. Timer defusers (no-setTimeout-if, no-setInterval-if)
 * 3. Network interceptors (prevent-fetch, prevent-xhr)
 * 4. DOM manipulation (remove-class, remove-attr, remove-node-text)
 * 5. Event defusers (prevent-addEventListener, prevent-bab)
 * 6. Cookie/storage (cookie-remover, set-local-storage-item)
 * 7. Logging/debug (log, debug-on-property-read)
 * 
 * Reference: https://github.com/AduardTeam/Scriptlets
 */

type ScriptletFn = (...args: string[]) => string;

/**
 * Helper: safely serialize a string for use inside generated JS.
 * Uses JSON.stringify to prevent injection of backticks, ${}, newlines, etc.
 */
function js(str: string): string {
  return JSON.stringify(str);
}

const SCRIPTLETS: Record<string, ScriptletFn> = {
  /**
   * Abort execution when a property is read.
   * Prevents anti-adblock scripts from detecting the blocker.
   */
  "abort-on-property-read": (property: string) => `
(function() {
  var props = ${js(property)}.split(".");
  var base = window;
  for (var i = 0; i < props.length - 1; i++) {
    if (!(props[i] in base)) base[props[i]] = {};
    base = base[props[i]];
  }
  var prop = props[props.length - 1];
  Object.defineProperty(base, prop, {
    get: function() { throw new ReferenceError("blocked"); },
    set: function() {}
  });
})();
`,

  /**
   * Abort execution when a property is written.
   */
  "abort-on-property-write": (property: string) => `
(function() {
  var props = ${js(property)}.split(".");
  var base = window;
  for (var i = 0; i < props.length - 1; i++) {
    if (!(props[i] in base)) base[props[i]] = {};
    base = base[props[i]];
  }
  var prop = props[props.length - 1];
  Object.defineProperty(base, prop, {
    get: function() { return undefined; },
    set: function() { throw new ReferenceError("blocked"); }
  });
})();
`,

  /**
   * Set a constant value for a property.
   * Used to fake "ads loaded" signals.
   */
  "set-constant": (property: string, value: string) => {
    let resolvedValue: string;
    switch (value) {
      case "true": resolvedValue = "true"; break;
      case "false": resolvedValue = "false"; break;
      case "null": resolvedValue = "null"; break;
      case "undefined": resolvedValue = "undefined"; break;
      case "noopFunc": resolvedValue = "(function(){})"; break;
      case "trueFunc": resolvedValue = "(function(){return true})"; break;
      case "falseFunc": resolvedValue = "(function(){return false})"; break;
      case "emptyStr": resolvedValue = "''"; break;
      case "emptyArr": resolvedValue = "[]"; break;
      case "emptyObj": resolvedValue = "{}"; break;
      case "0": resolvedValue = "0"; break;
      case "1": resolvedValue = "1"; break;
      case "-1": resolvedValue = "-1"; break;
      case "NaN": resolvedValue = "NaN"; break;
      case "Infinity": resolvedValue = "Infinity"; break;
      case "": resolvedValue = "''"; break;
      case "yes": resolvedValue = "'yes'"; break;
      case "no": resolvedValue = "'no'"; break;
      default: resolvedValue = JSON.stringify(value); break;
    }
    return `
(function() {
  var props = ${js(property)}.split(".");
  var base = window;
  for (var i = 0; i < props.length - 1; i++) {
    if (!(props[i] in base)) base[props[i]] = {};
    base = base[props[i]];
  }
  var prop = props[props.length - 1];
  Object.defineProperty(base, prop, {
    get: function() { return ${resolvedValue}; },
    set: function() {},
    configurable: true
  });
})();
`;
  },

  /**
   * Prevent setTimeout/setInterval from executing matching callbacks.
   */
  "no-setTimeout-if": (match: string, _delay?: string) => `
(function() {
  var needle = ${js(match)};
  var origSetTimeout = window.setTimeout;
  window.setTimeout = function(fn, delay) {
    var s = typeof fn === "function" ? fn.toString() : String(fn);
    if (needle === "" || s.includes(needle)) return 0;
    return origSetTimeout.apply(this, arguments);
  };
})();
`,

  "no-setInterval-if": (match: string, _delay?: string) => `
(function() {
  var needle = ${js(match)};
  var origSetInterval = window.setInterval;
  window.setInterval = function(fn, delay) {
    var s = typeof fn === "function" ? fn.toString() : String(fn);
    if (needle === "" || s.includes(needle)) return 0;
    return origSetInterval.apply(this, arguments);
  };
})();
`,

  /**
   * Remove an element from the DOM when it appears.
   */
  "remove-node-text": (nodeName: string, match: string) => `
(function() {
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.nodeName && node.nodeName.toLowerCase() === ${js(nodeName.toLowerCase())}) {
          if (node.textContent && node.textContent.includes(${js(match)})) {
            node.remove();
          }
        }
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });\n  window.addEventListener("pagehide", function() { observer.disconnect(); });
})();
`,

  /**
   * Prevent window.open from being called.
   */
  "window.open-defuser": () => `
(function() {
  window.open = function() { return null; };
})();
`,

  /**
   * Disable console.log to prevent anti-adblock debug detection.
   */
  "disable-newtab-links": () => `
(function() {
  document.addEventListener("click", function(e) {
    var a = e.target.closest("a[target='_blank']");
    if (a) { a.removeAttribute("target"); }
  }, true);
})();
`,

  /**
   * Override document.cookie getter to prevent tracking cookie reads.
   */
  "cookie-remover": (match: string) => `
(function() {
  var needle = ${js(match)};
  var origDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
  if (!origDescriptor) return;
  Object.defineProperty(document, "cookie", {
    get: function() {
      var cookies = origDescriptor.get.call(this);
      if (!needle) return "";
      return cookies.split(";").filter(function(c) {
        return !c.trim().startsWith(needle);
      }).join(";");
    },
    set: function(val) {
      if (needle && val.trim().startsWith(needle)) return;
      origDescriptor.set.call(this, val);
    }
  });
})();
`,

  // ─── Network Interceptors ─────────────────────────────────────────────────

  /**
   * Prevent fetch() calls matching a pattern.
   * Blocks anti-adblock telemetry and ad-reinsertion fetches.
   */
  "prevent-fetch": (match: string, responseBody?: string) => `
(function() {
  var needle = ${js(match)};
  var body = ${responseBody ? `${js(responseBody)}` : "''"};
  var origFetch = window.fetch;
  window.fetch = function(resource, init) {
    var url = typeof resource === "string" ? resource : (resource && resource.url) || "";
    if (needle && url.includes(needle)) {
      return Promise.resolve(new Response(body, { status: 200, statusText: "OK" }));
    }
    return origFetch.apply(this, arguments);
  };
})();
`,

  /**
   * Prevent XMLHttpRequest matching a pattern.
   */
  "prevent-xhr": (match: string, responseText?: string) => `
(function() {
  var needle = ${js(match)};
  var fakeResponse = ${responseText ? `${js(responseText)}` : "''"};
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._veilUrl = url;
    if (needle && String(url).includes(needle)) {
      this._veilBlocked = true;
      return;
    }
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    if (this._veilBlocked) {
      Object.defineProperty(this, "readyState", { value: 4 });
      Object.defineProperty(this, "status", { value: 200 });
      Object.defineProperty(this, "responseText", { value: fakeResponse });
      Object.defineProperty(this, "response", { value: fakeResponse });
      if (this.onreadystatechange) this.onreadystatechange();
      if (this.onload) this.onload();
      return;
    }
    return origSend.apply(this, arguments);
  };
})();
`,

  // ─── Event Defusers ───────────────────────────────────────────────────────

  /**
   * Prevent addEventListener for matching event types or handlers.
   */
  "prevent-addEventListener": (eventType: string, match?: string) => `
(function() {
  var targetEvent = ${js(eventType)};
  var needle = ${js(match || "")};
  var origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, fn, options) {
    if (type === targetEvent || targetEvent === "") {
      if (!needle || (typeof fn === "function" && fn.toString().includes(needle))) {
        return;
      }
    }
    return origAdd.call(this, type, fn, options);
  };
})();
`,

  /**
   * Prevent BlockAdBlock (BAB) detection.
   * Neutralizes the popular BlockAdBlock library.
   */
  "prevent-bab": () => `
(function() {
  var noop = function() {};
  var props = ["blockAdBlock", "_blockAdBlock", "sniffAdBlock", "fuckAdBlock",
               "BlockAdBlock", "FuckAdBlock", "SniffAdBlock"];
  props.forEach(function(prop) {
    var obj = { check: noop, emitEvent: noop, clearEvent: noop,
                on: function() { return this; }, onDetected: noop, onNotDetected: noop,
                setOption: noop, _options: { checkOnLoad: false, resetOnEnd: false } };
    Object.defineProperty(window, prop, { get: function() { return obj; }, set: noop });
  });
})();
`,

  /**
   * Prevent adblock detection via bait elements.
   * Sites create elements with ad-related class names and check if they're hidden.
   */
  "prevent-adblock-detection": () => `
(function() {
  var origGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function(el) {
    var style = origGetComputedStyle.apply(this, arguments);
    if (el && el.className && typeof el.className === "string") {
      var cls = el.className.toLowerCase();
      if (cls.includes("ad") || cls.includes("banner") || cls.includes("sponsor")) {
        return new Proxy(style, {
          get: function(target, prop) {
            if (prop === "display") return "block";
            if (prop === "visibility") return "visible";
            if (prop === "opacity") return "1";
            if (prop === "height") return "1px";
            var val = target[prop];
            return typeof val === "function" ? val.bind(target) : val;
          }
        });
      }
    }
    return style;
  };
})();
`,

  // ─── DOM Manipulation ─────────────────────────────────────────────────────

  /**
   * Remove a CSS class from elements matching a selector.
   */
  "remove-class": (className: string, selector?: string) => `
(function() {
  var cls = ${js(className)};
  var sel = ${js(selector || "." + className)};
  function removeAll() {
    var els = document.querySelectorAll(sel);
    els.forEach(function(el) { el.classList.remove(cls); });
  }
  removeAll();
  var observer = new MutationObserver(removeAll);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });\n  window.addEventListener("pagehide", function() { observer.disconnect(); });
})();
`,

  /**
   * Remove an attribute from elements matching a selector.
   */
  "remove-attr": (attr: string, selector?: string) => `
(function() {
  var attrName = ${js(attr)};
  var sel = ${js(selector || "[" + attr + "]")};
  function removeAll() {
    var els = document.querySelectorAll(sel);
    els.forEach(function(el) { el.removeAttribute(attrName); });
  }
  removeAll();
  var observer = new MutationObserver(removeAll);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });\n  window.addEventListener("pagehide", function() { observer.disconnect(); });
})();
`,

  /**
   * Set an attribute on elements matching a selector.
   */
  "set-attr": (attr: string, value: string, selector?: string) => `
(function() {
  var attrName = ${js(attr)};
  var attrValue = ${js(value)};
  var sel = ${js(selector || "*")};
  function setAll() {
    var els = document.querySelectorAll(sel);
    els.forEach(function(el) { el.setAttribute(attrName, attrValue); });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setAll);
  } else {
    setAll();
  }
})();
`,

  /**
   * Hide elements matching a selector by adding display:none.
   */
  "hide-in-shadow-dom": (selector: string) => `
(function() {
  var sel = ${js(selector)};
  var origAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function() {
    var shadow = origAttachShadow.apply(this, arguments);
    var style = document.createElement("style");
    style.textContent = sel + " { display: none !important; }";
    shadow.appendChild(style);
    return shadow;
  };
})();
`,

  // ─── Storage Manipulation ─────────────────────────────────────────────────

  /**
   * Set a localStorage item to a specific value.
   * Used to fake consent/premium flags.
   */
  "set-local-storage-item": (key: string, value: string) => `
(function() {
  try {
    localStorage.setItem(${js(key)}, ${js(value)});
  } catch(e) {}
})();
`,

  /**
   * Set a sessionStorage item.
   */
  "set-session-storage-item": (key: string, value: string) => `
(function() {
  try {
    sessionStorage.setItem(${js(key)}, ${js(value)});
  } catch(e) {}
})();
`,

  /**
   * Remove a localStorage item.
   */
  "remove-local-storage-item": (key: string) => `
(function() {
  try {
    localStorage.removeItem(${js(key)});
  } catch(e) {}
})();
`,

  // ─── Timer Defusers (extended) ────────────────────────────────────────────

  /**
   * Prevent requestAnimationFrame matching a pattern.
   */
  "no-requestAnimationFrame-if": (match: string) => `
(function() {
  var needle = ${js(match)};
  var origRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function(fn) {
    if (needle && typeof fn === "function" && fn.toString().includes(needle)) {
      return 0;
    }
    return origRAF.apply(this, arguments);
  };
})();
`,

  /**
   * Adjust setTimeout delay (speed up or slow down).
   */
  "adjust-setTimeout": (match: string, newDelay: string) => `
(function() {
  var needle = ${js(match)};
  var delay = ${parseInt(newDelay) || 0};
  var origSetTimeout = window.setTimeout;
  window.setTimeout = function(fn, d) {
    var s = typeof fn === "function" ? fn.toString() : String(fn);
    if (needle === "" || s.includes(needle)) {
      arguments[1] = delay;
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
  var needle = ${js(match)};
  var delay = ${parseInt(newDelay) || 0};
  var origSetInterval = window.setInterval;
  window.setInterval = function(fn, d) {
    var s = typeof fn === "function" ? fn.toString() : String(fn);
    if (needle === "" || s.includes(needle)) {
      arguments[1] = delay;
    }
    return origSetInterval.apply(this, arguments);
  };
})();
`,

  // ─── Overlay / Modal Defusers ─────────────────────────────────────────────

  /**
   * Remove overlay elements that block page content.
   * Targets anti-adblock walls and subscription nags.
   */
  "remove-overlay": (selector?: string) => `
(function() {
  var sel = ${js(selector || "")};
  function removeOverlays() {
    var candidates = sel ? document.querySelectorAll(sel) : [];
    if (!sel) {
      candidates = document.querySelectorAll("[class*='overlay'],[class*='modal'],[class*='paywall'],[id*='overlay'],[id*='modal']");
    }
    candidates.forEach(function(el) {
      var style = window.getComputedStyle(el);
      if (style.position === "fixed" || style.position === "absolute") {
        if (parseFloat(style.zIndex) > 999 || style.zIndex === "auto") {
          el.remove();
        }
      }
    });
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeOverlays);
  } else {
    removeOverlays();
  }
  var observer = new MutationObserver(removeOverlays);
  observer.observe(document.documentElement, { childList: true, subtree: true });\n  window.addEventListener("pagehide", function() { observer.disconnect(); });
})();
`,

  /**
   * Restore scrolling when a page disables it (anti-adblock walls).
   */
  "allow-scroll": () => `
(function() {
  var style = document.createElement("style");
  style.textContent = "html, body { overflow: auto !important; position: static !important; }";
  (document.head || document.documentElement).appendChild(style);
  document.addEventListener("DOMContentLoaded", function() {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  });
})();
`,

  // ─── Fingerprinting Protection ────────────────────────────────────────────

  /**
   * Spoof navigator properties to prevent fingerprinting.
   */
  "spoof-navigator": (property: string, value: string) => `
(function() {
  try {
    Object.defineProperty(Navigator.prototype, ${js(property)}, {
      get: function() { return ${value === "undefined" ? "undefined" : `${js(value)}`}; }
    });
  } catch(e) {}
})();
`,

  /**
   * Prevent canvas fingerprinting by adding noise.
   */
  "prevent-canvas-fingerprint": () => `
(function() {
  var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  var origToBlob = HTMLCanvasElement.prototype.toBlob;
  var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  HTMLCanvasElement.prototype.toDataURL = function() {
    var ctx = this.getContext("2d");
    if (ctx) {
      var imageData = origGetImageData.call(ctx, 0, 0, 1, 1);
      imageData.data[0] = (imageData.data[0] + 1) % 256;
      ctx.putImageData(imageData, 0, 0);
    }
    return origToDataURL.apply(this, arguments);
  };
  HTMLCanvasElement.prototype.toBlob = function(callback) {
    var ctx = this.getContext("2d");
    if (ctx) {
      var imageData = origGetImageData.call(ctx, 0, 0, 1, 1);
      imageData.data[0] = (imageData.data[0] + 1) % 256;
      ctx.putImageData(imageData, 0, 0);
    }
    return origToBlob.apply(this, arguments);
  };
})();
`,

  // ─── Logging / Debug ──────────────────────────────────────────────────────

  /**
   * Log property access for debugging filter rules.
   */
  "log-on-property-read": (property: string) => `
(function() {
  var props = ${js(property)}.split(".");
  var base = window;
  for (var i = 0; i < props.length - 1; i++) {
    if (!(props[i] in base)) return;
    base = base[props[i]];
  }
  var prop = props[props.length - 1];
  var origValue = base[prop];
  Object.defineProperty(base, prop, {
    get: function() {
      // Debug output removed to avoid anti-adblock detection
      return origValue;
    },
    set: function(v) { origValue = v; },
    configurable: true
  });
})();
`,

  /**
   * Log addEventListener calls for debugging.
   */
  "log-addEventListener": () => `
(function() {
  var origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, fn, options) {
    // Debug output removed to avoid anti-adblock detection
    return origAdd.call(this, type, fn, options);
  };
})();
`,

  // ─── JSON Manipulation ────────────────────────────────────────────────────

  /**
   * Modify JSON.parse results to remove ad-related properties.
   */
  "json-prune": (propsToRemove: string, requiredProps?: string) => `
(function() {
  var prune = ${js(propsToRemove)}.split(" ");
  var required = ${js(requiredProps || "")}.split(" ").filter(Boolean);
  var origParse = JSON.parse;
  JSON.parse = function() {
    var result = origParse.apply(this, arguments);
    if (result && typeof result === "object") {
      if (required.length > 0) {
        var hasRequired = required.every(function(p) { return p in result; });
        if (!hasRequired) return result;
      }
      prune.forEach(function(p) {
        var parts = p.split(".");
        var obj = result;
        for (var i = 0; i < parts.length - 1; i++) {
          if (!obj || typeof obj !== "object") return;
          obj = obj[parts[i]];
        }
        if (obj && typeof obj === "object") {
          delete obj[parts[parts.length - 1]];
        }
      });
    }
    return result;
  };
})();
`,

  /**
   * Prevent JSON.parse from processing matching strings.
   */
  "prevent-json-parse": (match: string) => `
(function() {
  var needle = ${js(match)};
  var origParse = JSON.parse;
  JSON.parse = function(text) {
    if (needle && typeof text === "string" && text.includes(needle)) {
      return {};
    }
    return origParse.apply(this, arguments);
  };
})();
`,
};

/**
 * Generate injectable script code for a scriptlet.
 */
export function generateScriptlet(name: string, ...args: string[]): string | null {
  const fn = SCRIPTLETS[name];
  if (!fn) return null;
  return fn(...args);
}

/**
 * Parse a scriptlet rule and return the injectable code.
 * Format: //scriptlet("name", "arg1", "arg2")
 */
export function parseScriptletRule(rule: string): { name: string; args: string[]; code: string } | null {
  const match = rule.match(/\/\/scriptlet\("([^"]+)"(?:,\s*"([^"]*)")*\)/);
  if (!match) return null;

  const name = match[1]!;
  const args: string[] = [];

  // Extract all quoted arguments
  const argMatches = rule.matchAll(/"([^"]*)"/g);
  let first = true;
  for (const m of argMatches) {
    if (first) { first = false; continue; } // skip name
    args.push(m[1]!);
  }

  const code = generateScriptlet(name, ...args);
  if (!code) return null;

  return { name, args, code };
}

/**
 * Get list of available scriptlet names.
 */
export function getAvailableScriptlets(): string[] {
  return Object.keys(SCRIPTLETS);
}
