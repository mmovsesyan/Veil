/**
 * Redirect resources for $redirect modifier.
 * When a request is blocked with $redirect, instead of canceling it,
 * we serve a neutered version of the resource.
 * 
 * This prevents page breakage when scripts expect a response.
 * Inspired by uBlock Origin's redirect engine.
 */

// Base64-encoded minimal resources
const RESOURCES: Record<string, { contentType: string; data: string }> = {
  // 1x1 transparent GIF
  "1x1.gif": {
    contentType: "image/gif",
    data: "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  },

  // 1x1 transparent PNG
  "1x1.png": {
    contentType: "image/png",
    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElEQkSuQmCC",
  },

  // Empty JavaScript (noop)
  "noop.js": {
    contentType: "application/javascript",
    data: btoa("(function(){})();"),
  },

  // Empty text
  "noop.txt": {
    contentType: "text/plain",
    data: btoa(""),
  },

  // Empty HTML
  "noop.html": {
    contentType: "text/html",
    data: btoa("<!DOCTYPE html><html><head></head><body></body></html>"),
  },

  // Empty CSS
  "noop.css": {
    contentType: "text/css",
    data: btoa(""),
  },

  // Empty JSON
  "noop.json": {
    contentType: "application/json",
    data: btoa("{}"),
  },

  // Empty XML
  "noop.xml": {
    contentType: "text/xml",
    data: btoa('<?xml version="1.0" encoding="UTF-8"?><root/>'),
  },

  // 2x2 transparent PNG (for larger image placeholders)
  "2x2.png": {
    contentType: "image/png",
    data: "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElEQkSuQmCC",
  },

  // 3x2 transparent PNG (for video poster placeholders)
  "3x2.png": {
    contentType: "image/png",
    data: "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElEQkSuQmCC",
  },

  // Google Analytics noop
  "google-analytics.com/analytics.js": {
    contentType: "application/javascript",
    data: btoa(`
(function() {
  var noopfn = function() { return null; };
  var Tracker = function() {};
  Tracker.prototype = {
    get: noopfn, set: noopfn, send: noopfn,
  };
  window.ga = window.ga || function() {
    (window.ga.q = window.ga.q || []).push(arguments);
  };
  window.ga.create = function() { return new Tracker(); };
  window.ga.getByName = function() { return new Tracker(); };
  window.ga.getAll = function() { return []; };
  window.ga.remove = noopfn;
})();
`),
  },

  // Google Tag Manager noop
  "googletagmanager.com/gtm.js": {
    contentType: "application/javascript",
    data: btoa("(function(){window.dataLayer=window.dataLayer||[];})();"),
  },

  // Fingerprinting protection (canvas)
  "fingerprint-noop.js": {
    contentType: "application/javascript",
    data: btoa(`
(function() {
  var orig = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function() {
    return orig.apply(this, arguments);
  };
})();
`),
  },
};

/**
 * Get a redirect resource by name.
 * Returns a data: URL that can be used as a redirect target.
 */
export function getRedirectResource(name: string): string | null {
  const resource = RESOURCES[name];
  if (!resource) return null;
  return `data:${resource.contentType};base64,${resource.data}`;
}

/**
 * Get redirect resource for a given resource type.
 * Used when $redirect=<name> is not specified but $redirect is present.
 */
export function getDefaultRedirect(resourceType: string): string | null {
  switch (resourceType) {
    case "script":
      return getRedirectResource("noop.js");
    case "image":
      return getRedirectResource("1x1.gif");
    case "stylesheet":
      return getRedirectResource("noop.css");
    case "xmlhttprequest":
      return getRedirectResource("noop.txt");
    case "media":
      return getRedirectResource("noop.txt");
    default:
      return getRedirectResource("noop.txt");
  }
}

/**
 * List all available redirect resource names.
 */
export function getAvailableResources(): string[] {
  return Object.keys(RESOURCES);
}

export { RESOURCES };
