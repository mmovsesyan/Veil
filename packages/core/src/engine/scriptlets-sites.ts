/**
 * Site-specific scriptlets for the most popular sites with anti-adblock.
 * These handle YouTube, Twitch, Forbes, and other major sites.
 */

type ScriptletFn = (...args: string[]) => string;

export const SITE_SCRIPTLETS: Record<string, ScriptletFn> = {
  /**
   * YouTube ad bypass — skip ad segments.
   */
  "youtube-ads-skip": () => `
(function() {
  var origDefine = Object.defineProperty;
  // Intercept ad flags in player config
  var handler = {
    set: function(target, prop, value) {
      if (prop === "adPlacements" || prop === "playerAds" || prop === "adSlots") {
        return true;
      }
      target[prop] = value;
      return true;
    }
  };

  // Override ytInitialPlayerResponse
  var origParse = JSON.parse;
  JSON.parse = function(text) {
    var result = origParse.apply(this, arguments);
    if (result && result.adPlacements) {
      delete result.adPlacements;
    }
    if (result && result.playerAds) {
      delete result.playerAds;
    }
    return result;
  };

  // Skip video ads by seeking to end
  var checkAd = setInterval(function() {
    var player = document.querySelector(".html5-video-player");
    if (!player) return;
    var ad = player.classList.contains("ad-showing");
    if (ad) {
      var video = player.querySelector("video");
      if (video && video.duration) {
        video.currentTime = video.duration;
        var skipBtn = document.querySelector(".ytp-ad-skip-button, .ytp-ad-skip-button-modern");
        if (skipBtn) skipBtn.click();
      }
    }
  }, 500);
})();
`,

  /**
   * Twitch ad bypass — replace ad segments with stream.
   */
  "twitch-ads-bypass": () => `
(function() {
  // Prevent Twitch ad insertion by overriding worker messages
  var origWorker = window.Worker;
  window.Worker = function(url) {
    var w = new origWorker(url);
    var origPostMessage = w.postMessage;
    w.postMessage = function(msg) {
      if (msg && typeof msg === "object" && msg.type === "adRequest") {
        return; // Block ad requests
      }
      return origPostMessage.apply(this, arguments);
    };
    return w;
  };
  window.Worker.prototype = origWorker.prototype;

  // Remove ad banners
  var observer = new MutationObserver(function() {
    var ads = document.querySelectorAll('[data-a-target="video-ad-label"], .ad-banner');
    ads.forEach(function(el) { el.remove(); });
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
`,

  /**
   * Forbes anti-adblock bypass.
   */
  "forbes-anti-adblock": () => `
(function() {
  // Forbes checks for ad elements visibility
  Object.defineProperty(window, "fbs_settings", {
    get: function() { return { adblock: false }; },
    set: function() {}
  });
  Object.defineProperty(window, "forbes_ABTest", {
    get: function() { return { adblock: false, showWelcome: false }; },
    set: function() {}
  });
  // Remove paywall overlay
  setTimeout(function() {
    var overlay = document.querySelector(".article-body-overlay, .paywall-overlay");
    if (overlay) overlay.remove();
    document.body.style.overflow = "";
  }, 1000);
})();
`,

  /**
   * Generic anti-adblock wall remover.
   */
  "remove-adblock-wall": (selector: string) => `
(function() {
  function remove() {
    var wall = document.querySelector("${selector || '.adblock-wall, .adblock-overlay, [class*=adblock], [id*=adblock]'}");
    if (wall) {
      wall.remove();
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.documentElement.style.overflow = "";
    }
  }
  remove();
  var obs = new MutationObserver(remove);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(remove, 1000);
  setTimeout(remove, 3000);
})();
`,

  /**
   * Bypass countdown timers (wait X seconds before content).
   */
  "skip-countdown": (selector: string) => `
(function() {
  function skip() {
    var el = document.querySelector("${selector || '.countdown, .timer, [class*=countdown]'}");
    if (el) el.remove();
    // Also try to reveal hidden content
    var hidden = document.querySelectorAll("[style*='display: none'], [style*='visibility: hidden']");
    hidden.forEach(function(h) {
      if (h.id && (h.id.includes("content") || h.id.includes("article"))) {
        h.style.display = "";
        h.style.visibility = "";
      }
    });
  }
  setTimeout(skip, 500);
  setTimeout(skip, 2000);
})();
`,

  /**
   * Disable scroll lock (used by anti-adblock overlays).
   */
  "unlock-scroll": () => `
(function() {
  var origSet = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, "overflow");
  if (!origSet || !origSet.set) return;
  Object.defineProperty(CSSStyleDeclaration.prototype, "overflow", {
    set: function(val) {
      if (val === "hidden" && (this === document.body.style || this === document.documentElement.style)) {
        return; // Prevent scroll lock
      }
      origSet.set.call(this, val);
    },
    get: origSet.get
  });
})();
`,

  /**
   * Fake Google AdSense loaded signal.
   */
  "fake-adsense-loaded": () => `
(function() {
  window.google_ad_status = 1;
  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.loaded = true;
  window.adsbygoogle.push = function() { return 1; };
  // Create fake ad elements
  document.querySelectorAll("ins.adsbygoogle").forEach(function(ins) {
    ins.setAttribute("data-ad-status", "filled");
    ins.style.display = "block";
    ins.style.height = "1px";
  });
})();
`,

  /**
   * Prevent detection via bait elements.
   * Anti-adblock scripts create hidden elements with ad-like classes
   * and check if they're hidden by the blocker.
   */
  "prevent-bait-detection": () => `
(function() {
  var origGetComputedStyle = window.getComputedStyle;
  var baitClasses = ["ad", "ads", "adsbox", "ad-placeholder", "adbanner", "ad_banner"];
  
  window.getComputedStyle = function(el) {
    var style = origGetComputedStyle.apply(this, arguments);
    if (el && el.className) {
      var cls = typeof el.className === "string" ? el.className.toLowerCase() : "";
      for (var i = 0; i < baitClasses.length; i++) {
        if (cls.includes(baitClasses[i])) {
          return new Proxy(style, {
            get: function(target, prop) {
              if (prop === "display") return "block";
              if (prop === "visibility") return "visible";
              if (prop === "opacity") return "1";
              if (prop === "height") return "1px";
              if (prop === "getPropertyValue") {
                return function(p) {
                  if (p === "display") return "block";
                  if (p === "visibility") return "visible";
                  return target.getPropertyValue(p);
                };
              }
              var val = target[prop];
              return typeof val === "function" ? val.bind(target) : val;
            }
          });
        }
      }
    }
    return style;
  };

  // Also prevent offsetHeight/offsetWidth detection
  var origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  if (origOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      get: function() {
        var cls = (this.className || "").toLowerCase();
        for (var i = 0; i < baitClasses.length; i++) {
          if (cls.includes(baitClasses[i])) return 1;
        }
        return origOffsetHeight.get.call(this);
      }
    });
  }
})();
`,

  /**
   * Disable Notification/Push API prompts.
   */
  "block-push-notifications": () => `
(function() {
  if (window.Notification) {
    window.Notification.requestPermission = function() { return Promise.resolve("denied"); };
    Object.defineProperty(Notification, "permission", { get: function() { return "denied"; } });
  }
  if (navigator.serviceWorker) {
    var origRegister = navigator.serviceWorker.register;
    navigator.serviceWorker.register = function(url) {
      if (String(url).includes("push") || String(url).includes("notification")) {
        return Promise.reject(new Error("blocked"));
      }
      return origRegister.apply(this, arguments);
    };
  }
})();
`,

  /**
   * Prevent page visibility detection (anti-adblock checks if tab is active).
   */
  "prevent-visibility-detection": () => `
(function() {
  Object.defineProperty(document, "hidden", { get: function() { return false; } });
  Object.defineProperty(document, "visibilityState", { get: function() { return "visible"; } });
  document.addEventListener = new Proxy(document.addEventListener, {
    apply: function(target, thisArg, args) {
      if (args[0] === "visibilitychange") return;
      return Reflect.apply(target, thisArg, args);
    }
  });
})();
`,

  /**
   * Spoof navigator.plugins to prevent plugin-based fingerprinting.
   */
  "spoof-navigator-plugins": () => `
(function() {
  Object.defineProperty(navigator, "plugins", {
    get: function() {
      return [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
        { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
        { name: "Native Client", filename: "internal-nacl-plugin" },
      ];
    }
  });
  Object.defineProperty(navigator, "mimeTypes", {
    get: function() { return { length: 4 }; }
  });
})();
`,

  /**
   * Block WebSocket connections to tracking domains.
   */
  "block-websocket": (match: string) => `
(function() {
  var origWS = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    if ("${match}" && String(url).includes("${match}")) {
      return { send: function(){}, close: function(){}, addEventListener: function(){} };
    }
    return new origWS(url, protocols);
  };
  window.WebSocket.prototype = origWS.prototype;
  window.WebSocket.CONNECTING = 0;
  window.WebSocket.OPEN = 1;
  window.WebSocket.CLOSING = 2;
  window.WebSocket.CLOSED = 3;
})();
`,
};
