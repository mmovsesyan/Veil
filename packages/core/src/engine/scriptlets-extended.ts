/**
 * Extended scriptlets library — additional anti-adblock bypass techniques.
 * Combined with scriptlets.ts, this gives ~50 scriptlets total.
 */

type ScriptletFn = (...args: string[]) => string;

export const EXTENDED_SCRIPTLETS: Record<string, ScriptletFn> = {
  /**
   * Prevent addEventListener from registering specific event handlers.
   */
  "prevent-addEventListener": (type: string, match: string) => `
(function() {
  var origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(t, fn, opts) {
    if (t === "${type}") {
      var s = typeof fn === "function" ? fn.toString() : "";
      if ("${match}" === "" || s.includes("${match}")) return;
    }
    return origAdd.call(this, t, fn, opts);
  };
})();
`,

  /**
   * Prevent fetch from completing for matching URLs.
   */
  "prevent-fetch": (match: string) => `
(function() {
  var origFetch = window.fetch;
  window.fetch = function(url) {
    var s = typeof url === "string" ? url : (url && url.url) || "";
    if ("${match}" === "" || s.includes("${match}")) {
      return Promise.resolve(new Response("", { status: 200 }));
    }
    return origFetch.apply(this, arguments);
  };
})();
`,

  /**
   * Prevent XMLHttpRequest from completing for matching URLs.
   */
  "prevent-xhr": (match: string) => `
(function() {
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  var blocked = new WeakSet();
  XMLHttpRequest.prototype.open = function(method, url) {
    if ("${match}" !== "" && String(url).includes("${match}")) {
      blocked.add(this);
    }
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    if (blocked.has(this)) {
      Object.defineProperty(this, "readyState", { value: 4 });
      Object.defineProperty(this, "status", { value: 200 });
      Object.defineProperty(this, "responseText", { value: "" });
      Object.defineProperty(this, "response", { value: "" });
      this.dispatchEvent(new Event("load"));
      return;
    }
    return origSend.apply(this, arguments);
  };
})();
`,

  /**
   * Remove a CSS class from elements matching a selector.
   */
  "remove-class": (className: string, selector: string) => `
(function() {
  var sel = "${selector}" || "." + "${className}";
  function remove() {
    document.querySelectorAll(sel).forEach(function(el) {
      el.classList.remove("${className}");
    });
  }
  remove();
  var obs = new MutationObserver(remove);
  obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
})();
`,

  /**
   * Remove an attribute from elements.
   */
  "remove-attr": (attr: string, selector: string) => `
(function() {
  var sel = "${selector}" || "[${attr}]";
  function remove() {
    document.querySelectorAll(sel).forEach(function(el) {
      el.removeAttribute("${attr}");
    });
  }
  remove();
  var obs = new MutationObserver(remove);
  obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
})();
`,

  /**
   * Override JSON.parse to modify responses.
   */
  "json-prune": (path: string) => `
(function() {
  var origParse = JSON.parse;
  JSON.parse = function() {
    var r = origParse.apply(this, arguments);
    if (r && typeof r === "object") {
      var props = "${path}".split(".");
      var obj = r;
      for (var i = 0; i < props.length - 1; i++) {
        if (!obj[props[i]]) return r;
        obj = obj[props[i]];
      }
      delete obj[props[props.length - 1]];
    }
    return r;
  };
})();
`,

  /**
   * Spoof navigator properties (for fingerprinting protection).
   */
  "navigator-spoof": (prop: string, value: string) => `
(function() {
  try {
    Object.defineProperty(Navigator.prototype, "${prop}", {
      get: function() { return ${value.startsWith("{") || value.startsWith("[") ? value : JSON.stringify(value)}; }
    });
  } catch(e) {}
})();
`,

  /**
   * Prevent document.write from executing.
   */
  "no-document-write": (match: string) => `
(function() {
  var orig = document.write;
  document.write = function(s) {
    if ("${match}" === "" || String(s).includes("${match}")) return;
    return orig.apply(this, arguments);
  };
  document.writeln = document.write;
})();
`,

  /**
   * Disable WebRTC to prevent IP leaks.
   */
  "disable-webrtc": () => `
(function() {
  if (window.RTCPeerConnection) {
    window.RTCPeerConnection = function() { throw new Error("WebRTC disabled"); };
  }
  if (window.webkitRTCPeerConnection) {
    window.webkitRTCPeerConnection = window.RTCPeerConnection;
  }
})();
`,

  /**
   * Override Date.now() to prevent timing-based fingerprinting.
   */
  "date-now-spoof": () => `
(function() {
  var offset = Math.floor(Math.random() * 100);
  var origNow = Date.now;
  Date.now = function() { return origNow.call(Date) + offset; };
})();
`,

  /**
   * Block canvas fingerprinting by adding noise.
   */
  "canvas-fingerprint-protect": () => `
(function() {
  var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  var origToBlob = HTMLCanvasElement.prototype.toBlob;
  var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;

  HTMLCanvasElement.prototype.toDataURL = function() {
    var ctx = this.getContext("2d");
    if (ctx) {
      var imageData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
      for (var i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] ^= 1;
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return origToDataURL.apply(this, arguments);
  };

  HTMLCanvasElement.prototype.toBlob = function(cb) {
    var dataUrl = this.toDataURL();
    var arr = dataUrl.split(",");
    var mime = arr[0].match(/:(.*?);/)[1];
    var bstr = atob(arr[1]);
    var n = bstr.length;
    var u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    cb(new Blob([u8arr], { type: mime }));
  };
})();
`,

  /**
   * Prevent popups and new windows.
   */
  "noeval": () => `
(function() {
  window.eval = function() { return null; };
})();
`,

  /**
   * Log and block specific cookie setting.
   */
  "trusted-set-cookie": (name: string, value: string) => `
(function() {
  document.cookie = "${name}=${value}; path=/; max-age=86400";
})();
`,

  /**
   * Override CSS visibility for anti-adblock overlays.
   */
  "remove-overlay": (selector: string) => `
(function() {
  function remove() {
    var el = document.querySelector("${selector}");
    if (el) {
      el.remove();
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
  }
  remove();
  var obs = new MutationObserver(remove);
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
`,

  /**
   * Spoof the Notification API permission.
   */
  "notification-permission-spoof": () => `
(function() {
  if (window.Notification) {
    Object.defineProperty(Notification, "permission", { get: function() { return "denied"; } });
    Notification.requestPermission = function() { return Promise.resolve("denied"); };
  }
})();
`,
};
