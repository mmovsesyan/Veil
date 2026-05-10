/**
 * Critical scriptlets for bypassing the most common anti-adblock walls.
 * 
 * These target the top anti-adblock solutions used by major websites:
 * - BlockAdBlock / FuckAdBlock
 * - Admiral (adblock recovery)
 * - Instart Logic
 * - YouTube ad injection
 * - Forbes / Wired / Business Insider walls
 */

type ScriptletFn = (...args: string[]) => string;

function esc(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export const CRITICAL_SCRIPTLETS: Record<string, ScriptletFn> = {
  /**
   * Abort execution of inline scripts containing a specific string.
   * This is the #1 most-used scriptlet in uBlock Origin filters.
   * 
   * Usage: example.com#%#//scriptlet("abort-current-inline-script", "adblock")
   */
  "abort-current-inline-script": (property: string, search?: string) => `
(function() {
  var needle = "${esc(search || "")}";
  var magic = String.fromCharCode(Date.now() % 26 + 97) + Math.random().toString(36).slice(2, 8);
  var prop = "${esc(property)}";
  var owner = window;
  var chain = prop.split(".");
  
  for (var i = 0; i < chain.length - 1; i++) {
    if (!(chain[i] in owner)) owner[chain[i]] = {};
    owner = owner[chain[i]];
  }
  
  var desc = Object.getOwnPropertyDescriptor(owner, chain[chain.length - 1]);
  var currentValue = desc ? desc.value : undefined;
  
  var abort = function() {
    var e = new Error(magic);
    // Walk the stack to find the inline script
    if (needle === "" || (e.stack && e.stack.toString().includes(needle))) {
      throw new ReferenceError(magic);
    }
  };
  
  Object.defineProperty(owner, chain[chain.length - 1], {
    get: function() { abort(); return currentValue; },
    set: function(v) { abort(); currentValue = v; }
  });
  
  // Catch our own errors silently
  var origOnerror = window.onerror;
  window.onerror = function(msg) {
    if (typeof msg === "string" && msg.includes(magic)) return true;
    if (origOnerror) return origOnerror.apply(this, arguments);
    return false;
  };
})();
`,

  /**
   * Trusted set-constant — like set-constant but allows function values.
   * Used for complex anti-adblock that checks typeof.
   */
  "trusted-set-constant": (property: string, value: string) => {
    // Parse complex values
    let code: string;
    if (value === "noopFunc") code = "function(){}";
    else if (value === "trueFunc") code = "function(){return true}";
    else if (value === "falseFunc") code = "function(){return false}";
    else if (value === "noopPromiseResolve") code = "function(){return Promise.resolve()}";
    else if (value === "noopPromiseReject") code = "function(){return Promise.reject()}";
    else if (value === "noopArray") code = "function(){return[]}";
    else if (value === "noopObject") code = "function(){return{}}";
    else if (value.startsWith("{") || value.startsWith("[")) code = value;
    else if (value === "true" || value === "false") code = value;
    else if (value === "null" || value === "undefined") code = value;
    else if (!isNaN(Number(value))) code = value;
    else code = `"${esc(value)}"`;

    return `
(function() {
  var props = "${esc(property)}".split(".");
  var base = window;
  for (var i = 0; i < props.length - 1; i++) {
    if (!(props[i] in base)) base[props[i]] = {};
    base = base[props[i]];
  }
  var prop = props[props.length - 1];
  var value = ${code};
  Object.defineProperty(base, prop, {
    get: function() { return value; },
    set: function() {},
    configurable: true,
    enumerable: true
  });
})();
`;
  },

  /**
   * Nano setTimeout/setInterval booster — speed up or slow down timers.
   * Used to skip countdown timers on ad-supported download sites.
   */
  "nano-setTimeout-booster": (match: string, boost?: string) => `
(function() {
  var needle = "${esc(match)}";
  var factor = ${parseFloat(boost || "0.05") || 0.05};
  var origSetTimeout = window.setTimeout;
  window.setTimeout = function(fn, delay) {
    var s = typeof fn === "function" ? fn.toString() : String(fn);
    if (needle === "" || s.includes(needle)) {
      arguments[1] = Math.round((delay || 0) * factor);
    }
    return origSetTimeout.apply(this, arguments);
  };
})();
`,

  "nano-setInterval-booster": (match: string, boost?: string) => `
(function() {
  var needle = "${esc(match)}";
  var factor = ${parseFloat(boost || "0.05") || 0.05};
  var origSetInterval = window.setInterval;
  window.setInterval = function(fn, delay) {
    var s = typeof fn === "function" ? fn.toString() : String(fn);
    if (needle === "" || s.includes(needle)) {
      arguments[1] = Math.round((delay || 0) * factor);
    }
    return origSetInterval.apply(this, arguments);
  };
})();
`,

  /**
   * Close window — used to close popup/popunder windows.
   */
  "close-window": () => `
(function() {
  window.close();
})();
`,

  /**
   * Prevent window.open — block popups/popunders.
   */
  "prevent-window-open": (match?: string, replacement?: string) => `
(function() {
  var needle = "${esc(match || "")}";
  var origOpen = window.open;
  window.open = function(url) {
    if (!needle || (url && String(url).includes(needle))) {
      return ${replacement === "obj" ? "{ closed: false, close: function(){}, focus: function(){} }" : "null"};
    }
    return origOpen.apply(this, arguments);
  };
})();
`,

  /**
   * No eval if — prevent eval() calls matching a pattern.
   * Blocks obfuscated anti-adblock scripts.
   */
  "noeval-if": (match: string) => `
(function() {
  var needle = "${esc(match)}";
  var origEval = window.eval;
  window.eval = function(code) {
    if (needle && typeof code === "string" && code.includes(needle)) {
      return undefined;
    }
    return origEval.apply(this, arguments);
  };
  window.eval.toString = function() { return "function eval() { [native code] }"; };
})();
`,

  /**
   * Set cookie — set a cookie to bypass consent/paywall checks.
   */
  "set-cookie": (name: string, value: string) => `
(function() {
  var d = new Date();
  d.setTime(d.getTime() + 86400000);
  document.cookie = "${esc(name)}=${esc(value)}; expires=" + d.toUTCString() + "; path=/; SameSite=Lax";
})();
`,

  /**
   * Remove cookie — delete a specific cookie.
   */
  "remove-cookie": (name: string) => `
(function() {
  var domains = [location.hostname, "." + location.hostname];
  domains.forEach(function(domain) {
    document.cookie = "${esc(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=" + domain;
  });
})();
`,

  /**
   * Prevent Intersection Observer — blocks lazy-loaded ad injection.
   */
  "prevent-IntersectionObserver": () => `
(function() {
  window.IntersectionObserver = function(callback, options) {
    this.observe = function() {};
    this.unobserve = function() {};
    this.disconnect = function() {};
    this.takeRecords = function() { return []; };
  };
})();
`,

  /**
   * Prevent Performance Observer — blocks performance-based fingerprinting.
   */
  "prevent-PerformanceObserver": () => `
(function() {
  window.PerformanceObserver = function(callback) {
    this.observe = function() {};
    this.disconnect = function() {};
    this.takeRecords = function() { return []; };
  };
})();
`,

  /**
   * Spoof CSS visibility — make hidden ad bait elements appear visible.
   * Defeats getComputedStyle-based adblock detection.
   */
  "spoof-css": (selector: string, property: string, value: string) => `
(function() {
  var sel = "${esc(selector)}";
  var prop = "${esc(property)}";
  var val = "${esc(value)}";
  var origGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function(el, pseudo) {
    var style = origGetComputedStyle.call(this, el, pseudo);
    if (el && el.matches && el.matches(sel)) {
      return new Proxy(style, {
        get: function(target, p) {
          if (p === prop) return val;
          var v = target[p];
          return typeof v === "function" ? v.bind(target) : v;
        }
      });
    }
    return style;
  };
})();
`,

  /**
   * Prevent Mutation Observer — blocks dynamic ad reinsertion detection.
   */
  "prevent-MutationObserver": (match?: string) => `
(function() {
  var needle = "${esc(match || "")}";
  var OrigMO = window.MutationObserver;
  window.MutationObserver = function(callback) {
    var s = callback.toString();
    if (!needle || s.includes(needle)) {
      this.observe = function() {};
      this.disconnect = function() {};
      this.takeRecords = function() { return []; };
      return;
    }
    return new OrigMO(callback);
  };
  window.MutationObserver.prototype = OrigMO.prototype;
})();
`,

  /**
   * Href sanitizer — remove tracking redirects from links.
   * Converts tracking URLs to direct destination URLs.
   */
  "href-sanitizer": (selector: string, attr?: string) => `
(function() {
  var sel = "${esc(selector)}";
  var dataAttr = "${esc(attr || "data-href")}";
  function sanitize() {
    document.querySelectorAll(sel).forEach(function(el) {
      var real = el.getAttribute(dataAttr) || el.dataset.url || el.dataset.href;
      if (real && el.href !== real) {
        el.href = real;
        el.removeAttribute("data-tracking");
        el.removeAttribute("ping");
      }
    });
  }
  sanitize();
  new MutationObserver(sanitize).observe(document.documentElement, { childList: true, subtree: true });
})();
`,

  /**
   * Trusted replace fetch response — modify fetch responses.
   * Used to remove ad config from API responses.
   */
  "trusted-replace-fetch-response": (pattern: string, replacement: string, urlMatch?: string) => `
(function() {
  var needle = "${esc(pattern)}";
  var repl = "${esc(replacement)}";
  var urlNeedle = "${esc(urlMatch || "")}";
  var origFetch = window.fetch;
  window.fetch = function(resource, init) {
    var url = typeof resource === "string" ? resource : (resource && resource.url) || "";
    if (urlNeedle && !url.includes(urlNeedle)) {
      return origFetch.apply(this, arguments);
    }
    return origFetch.apply(this, arguments).then(function(response) {
      return response.text().then(function(text) {
        if (text.includes(needle)) {
          text = text.split(needle).join(repl);
        }
        return new Response(text, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      });
    });
  };
})();
`,
};
