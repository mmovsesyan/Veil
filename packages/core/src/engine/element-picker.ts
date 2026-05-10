/**
 * Element Picker — visual element selection for creating custom blocking rules.
 * 
 * Injected into the page when user activates "Pick element" mode.
 * Highlights elements on hover and generates optimal CSS selectors.
 * Similar to uBlock Origin's element picker.
 */

/**
 * Generate an optimal CSS selector for an element.
 * Tries to find the most specific yet readable selector.
 */
export function generateSelector(element: Element): string {
  // Strategy 1: ID selector (most specific)
  if (element.id) {
    const sel = `#${CSS.escape(element.id)}`;
    if (isUnique(sel)) return sel;
  }

  // Strategy 2: Unique class combination
  if (element.classList.length > 0) {
    const classes = Array.from(element.classList)
      .filter((c) => !isGenericClass(c))
      .sort((a, b) => b.length - a.length);

    for (const cls of classes) {
      const sel = `.${CSS.escape(cls)}`;
      if (isUnique(sel)) return sel;
    }

    // Try combinations of 2 classes
    for (let i = 0; i < classes.length; i++) {
      for (let j = i + 1; j < classes.length; j++) {
        const sel = `.${CSS.escape(classes[i]!)}.${CSS.escape(classes[j]!)}`;
        if (isUnique(sel)) return sel;
      }
    }
  }

  // Strategy 3: Tag + class
  const tag = element.tagName.toLowerCase();
  if (element.classList.length > 0) {
    const bestClass = Array.from(element.classList)
      .filter((c) => !isGenericClass(c))
      .sort((a, b) => b.length - a.length)[0];
    if (bestClass) {
      const sel = `${tag}.${CSS.escape(bestClass)}`;
      if (isUnique(sel)) return sel;
    }
  }

  // Strategy 4: Attribute selector
  const attrs = ["data-ad", "data-ad-slot", "data-testid", "role", "aria-label"];
  for (const attr of attrs) {
    const value = element.getAttribute(attr);
    if (value) {
      const sel = `${tag}[${attr}="${CSS.escape(value)}"]`;
      if (isUnique(sel)) return sel;
    }
  }

  // Strategy 5: nth-child path (fallback)
  return buildNthChildPath(element);
}

/**
 * Generate a filter rule from a selector and domain.
 */
export function generateFilterRule(domain: string, selector: string): string {
  return `${domain}##${selector}`;
}

/**
 * Get the element picker overlay HTML/CSS for injection.
 */
export function getPickerOverlayCode(): string {
  return `
(function() {
  if (document.getElementById("cb-picker-overlay")) return;

  var overlay = document.createElement("div");
  overlay.id = "cb-picker-overlay";
  overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;";

  var highlight = document.createElement("div");
  highlight.id = "cb-picker-highlight";
  highlight.style.cssText = "position:absolute;background:rgba(74,144,217,0.2);border:2px solid #4A90D9;pointer-events:none;transition:all 0.1s;display:none;";
  overlay.appendChild(highlight);

  var info = document.createElement("div");
  info.id = "cb-picker-info";
  info.style.cssText = "position:fixed;bottom:10px;left:50%;transform:translateX(-50%);background:#333;color:white;padding:8px 16px;border-radius:8px;font:13px monospace;z-index:2147483647;display:none;";
  overlay.appendChild(info);

  document.body.appendChild(overlay);

  var currentEl = null;

  document.addEventListener("mousemove", function(e) {
    overlay.style.pointerEvents = "none";
    var el = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = "";

    if (!el || el === overlay || overlay.contains(el)) return;
    currentEl = el;

    var rect = el.getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.top = rect.top + "px";
    highlight.style.left = rect.left + "px";
    highlight.style.width = rect.width + "px";
    highlight.style.height = rect.height + "px";

    info.style.display = "block";
    info.textContent = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className ? "." + el.className.split(" ").slice(0,2).join(".") : "");
  }, true);

  document.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (currentEl) {
      // Send selected element info to extension
      window.postMessage({
        type: "CB_ELEMENT_PICKED",
        tagName: currentEl.tagName,
        id: currentEl.id,
        classes: Array.from(currentEl.classList),
        attributes: Array.from(currentEl.attributes).map(function(a) { return { name: a.name, value: a.value }; }),
        rect: currentEl.getBoundingClientRect(),
      }, "*");
    }
    // Remove picker
    overlay.remove();
  }, true);

  // ESC to cancel
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") overlay.remove();
  });
})();
`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUnique(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function isGenericClass(cls: string): boolean {
  const generic = new Set([
    "active", "selected", "hidden", "visible", "show", "hide",
    "open", "closed", "enabled", "disabled", "first", "last",
    "odd", "even", "clearfix", "container", "wrapper", "row", "col",
  ]);
  return generic.has(cls.toLowerCase()) || cls.length <= 2;
}

function buildNthChildPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;

    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(current) + 1;
    const tag = current.tagName.toLowerCase();

    parts.unshift(`${tag}:nth-child(${index})`);
    current = parent;

    // Stop after 3 levels to keep selector readable
    if (parts.length >= 3) break;
  }

  return parts.join(" > ");
}
