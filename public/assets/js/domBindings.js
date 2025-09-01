// domBindings.js
// ✅ Enhanced DOM binding system with ui-*, loop features, and two-way binding

// Store original loop templates to avoid re-querying the DOM for them
const loopTemplates = new Map();

let latestState = {};


function getDeepValue(obj, path) {
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function parseStyleMap(styleStr) {
    const map = {};
    const parts = styleStr.split(";");
    for (const part of parts) {
        const [rule, styleName, styleVal] = part.trim().split(":");
        if (rule && styleName && styleVal) {
            if (!map[rule]) map[rule] = [];
            map[rule].push([styleName.trim(), styleVal.trim()]);
        }
    }
    return map;
}

function shouldSkip(index, rule) {
    if (!rule) return false;
    const n = index + 1;
    if (rule === "odd" && n % 2 === 1) return true;
    if (rule === "even" && n % 2 === 0) return true;
    if (rule.startsWith("every-")) {
        const mod = parseInt(rule.split("-")[1]);
        return !isNaN(mod) && n % mod === 0;
    }
    return false;
}

function applyLoopStyle(el, index, styleMap) {
    const n = index + 1;
    for (const key in styleMap) {
        let match = false;
        if (key === "odd" && n % 2 === 1) match = true;
        if (key === "even" && n % 2 === 0) match = true;
        if (key.startsWith("every-")) {
            const mod = parseInt(key.split("-")[1]);
            if (!isNaN(mod) && n % mod === 0) match = true;
        }

        if (match) {
            for (const [styleKey, val] of styleMap[key]) {
                el.style[styleKey] = val;
            }
        }
    }
}

// Optimized renderLoops: uses cloning and clears previous children
function renderLoops(state) {
    document.querySelectorAll("[ui-loop]").forEach(loopEl => {
        const loopExpr = loopEl.getAttribute("ui-loop"); // "user in users"
        const match = loopExpr.match(/^([\w$]+)\s+in\s+([\w$]+)$/);
        if (!match) return;

        const [_, itemName, listKey] = match;
        const list = state[listKey];
        if (!Array.isArray(list)) return;

        // Store the original template if not already stored
        if (!loopTemplates.has(loopEl)) {
            // Hide the original template element
            loopEl.style.display = 'none';
            loopTemplates.set(loopEl, loopEl.cloneNode(true));
        }

        const templateClone = loopTemplates.get(loopEl);

        const page = (state.__page?.[listKey] || 1);
        const perPage = (state.__perPage?.[listKey] || list.length);
        const start = (page - 1) * perPage;
        const end = start + perPage;

        const loopStyle = loopEl.getAttribute("ui-loop-style") || "";
        const skipRule = loopEl.getAttribute("ui-loop-skip") || "";
        const styleMap = parseStyleMap(loopStyle);

        // Clear existing children related to this loop before re-rendering
        // This is a common and efficient way to update lists without complex diffing
        // if the entire list is being re-rendered.
        // We identify children previously rendered by this loop via a custom attribute.
        // This prevents clearing other, unrelated children in the same parent.
        const parent = loopEl.parentElement;
        parent.querySelectorAll(`[data-ui-loop-origin="${listKey}"]`).forEach(child => child.remove());

        let rendered = 0;
        const fragment = document.createDocumentFragment(); // Use a document fragment for efficient appending

        for (let i = start; i < end && i < list.length; i++) {
            if (shouldSkip(i, skipRule)) continue;

            const item = list[i];
            // Use cloneNode(true) for more efficient cloning
            const clone = templateClone.cloneNode(true);
            clone.style.display = ''; // Make it visible again
            clone.removeAttribute("ui-loop"); // Prevent infinite loop nesting
            clone.setAttribute("data-loop-index", i);
            clone.setAttribute("data-ui-loop-origin", listKey); // Mark children from this loop

            // Scoped ui-bind replacements within the cloned element
            // Use querySelectorAll on the clone itself
            clone.querySelectorAll("[ui-bind]").forEach(bindEl => {
                const bindKey = bindEl.getAttribute("ui-bind");
                // Check if the bindKey refers to the loop item (e.g., "user.name")
                if (bindKey.startsWith(`${itemName}.`)) {
                    const localPath = bindKey.replace(`${itemName}.`, '');
                    const value = getDeepValue(item, localPath);
                    bindEl.textContent = value ?? "";
                } else {
                    // Handle global state bindings within the loop item if necessary
                    // For now, we assume ui-bind within a loop refers to the loop item
                    // or will be handled by the main bindStateToDOM if it's a global key.
                }
            });

            // Apply alternating styles
            applyLoopStyle(clone, i, styleMap);

            fragment.appendChild(clone);
            rendered++;
        }
        parent.appendChild(fragment); // Append all elements at once

        // Handle empty
        const emptyEl = document.querySelector(`[ui-loop-empty='${listKey}']`);
        if (emptyEl) {
            emptyEl.style.display = (rendered === 0) ? "" : "none";
        }
    });
}

// Function to handle two-way model binding (retains lazy logic)
function setupTwoWayBinding(el, key, dispatchFn, isLazy = false) {
    // Remove previous listener to prevent duplicates if function is called multiple times on same element
    if (el._ui_model_handler) {
        el.removeEventListener(el._ui_model_event, el._ui_model_handler);
    }

    const eventType = isLazy ? "blur" : "input";
    const handler = (e) => {
        const val = e.target.value;
        dispatchFn({ type: "__SET_MODEL", key, value: val });
    };

    el.addEventListener(eventType, handler);
    el._ui_model_handler = handler; // Store handler for removal
    el._ui_model_event = eventType; // Store event type for removal
}

// Centralized event listener setup using delegation
function initializeGlobalEventHandlers(dispatch) {
    document.body.addEventListener("click", (e) => {
        let target = e.target;

        // Handle ui-on clicks
        while (target && target !== document.body) {
            const uiOn = target.getAttribute("ui-on");
if (uiOn) {
  const [event, actionExpr] = uiOn.split(":");
  if (event === "click" && actionExpr) {
    let type = actionExpr.trim();
    let args = [];

    // Detect function-like syntax e.g. removeUser(user.name)
    const match = actionExpr.match(/^(\w+)\((.*)\)$/);
    if (match) {
      type = match[1]; // function name
      const rawArgs = match[2].split(",").map(s => s.trim()).filter(Boolean);

      args = rawArgs.map(arg => {
  // Case 1: string literal
  if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
    return arg.slice(1, -1);
  }
  // Case 2: number literal
  if (!isNaN(arg)) return Number(arg);
  // Case 3: resolve from loop scope
  const loopScope = target.closest("[data-loop-index]");
  if (loopScope && arg.startsWith("user.")) {
    const idx = parseInt(loopScope.getAttribute("data-loop-index"), 10);
    const listKey = loopScope.getAttribute("data-ui-loop-origin");
    return getDeepValue(latestState[listKey][idx], arg.replace("user.", ""));
  }
  // Fallback → pass raw string
  return arg;
});

    }

    dispatch({ type, args, event: e });
    e.stopPropagation();
    return;
  }
}

            // Handle ui-page-next/prev clicks
            const uiPageNext = target.getAttribute("ui-page-next");
            if (uiPageNext) {
                dispatch({ type: "__PAGE_NEXT", key: uiPageNext });
                e.stopPropagation();
                return;
            }
            const uiPagePrev = target.getAttribute("ui-page-prev");
            if (uiPagePrev) {
                dispatch({ type: "__PAGE_PREV", key: uiPagePrev });
                e.stopPropagation();
                return;
            }
            target = target.parentElement;
        }
    });

    document.body.addEventListener("input", (e) => {
        let target = e.target;
        // Handle ui-model (non-lazy)
        const uiModel = target.getAttribute("ui-model");
        if (uiModel && !target.hasAttribute("ui-model.lazy")) {
            // The actual binding for value update happens in bindStateToDOM
            // This listener here is mainly for the initial setup.
            // If we re-render often, `bindStateToDOM` will update the value.
            // The `setupTwoWayBinding` function ensures the listener is added only once per element.
            // No direct dispatch here, as `setupTwoWayBinding` handles it for actual value changes.
            return;
        }
    });

    document.body.addEventListener("blur", (e) => {
        let target = e.target;
        // Handle ui-model.lazy
        const uiModelLazy = target.getAttribute("ui-model.lazy");
        if (uiModelLazy) {
            // Same as above, the actual value dispatch is handled by `setupTwoWayBinding`
            return;
        }
    });

    document.body.addEventListener("submit", (e) => {
        let target = e.target;
        if (target.matches("[ui-form]")) {
            e.preventDefault();
            const formAction = target.getAttribute("ui-form");
            dispatch({ type: formAction });
            e.stopPropagation();
        }
    });
}

export function bindStateToDOM(state, dispatch) {
    // Collect all elements with ui-* attributes efficiently
    // This is a trade-off: one large query vs. many small ones.
    // For many diverse attributes, one large query is often faster.
    latestState = state; // Store latest state for potential future use
    const allUiElements = document.querySelectorAll(
        "[ui-bind], [ui-html], [ui-show], [ui-if], [ui-else], [ui-class], [ui-style], [ui-model], [ui-model\\.lazy], [ui-on], [ui-attr-], [ui-loop], [ui-loop-empty], [ui-page-next], [ui-page-prev], [ui-form]"
    );

    allUiElements.forEach(el => {
        // textContent
        if (el.hasAttribute("ui-bind")) {
            const key = el.getAttribute("ui-bind");
            // Check for loop-scoped bindings first, then global
            const loopIndex = el.closest('[data-loop-index]');
            if (loopIndex) {
                 // The ui-bind inside a loop is handled by renderLoops's scoped binding
                 // So we skip it here to avoid overwriting or incorrect global binding.
                 // This ensures the value is from the loop item, not global state.
            } else if (state.hasOwnProperty(key)) {
                el.textContent = state[key] ?? "";
            }
        }

        // innerHTML
        if (el.hasAttribute("ui-html")) {
            const key = el.getAttribute("ui-html");
            if (state.hasOwnProperty(key)) el.innerHTML = state[key] ?? "";
        }

        // toggle visibility (ui-show and ui-if are identical, keeping both for compatibility)
        if (el.hasAttribute("ui-show")) {
            const key = el.getAttribute("ui-show");
            el.style.display = state[key] ? "" : "none";
        }
        if (el.hasAttribute("ui-if")) {
            const key = el.getAttribute("ui-if");
            el.style.display = state[key] ? "" : "none";
        }

        if (el.hasAttribute("ui-else")) {
            const key = el.getAttribute("ui-else");
            el.style.display = !state[key] ? "" : "none";
        }

        // class toggle
        if (el.hasAttribute("ui-class")) {
            const [cls, key] = el.getAttribute("ui-class").split(":");
            if (cls && key) { // Ensure both parts exist
                if (state[key]) el.classList.add(cls);
                else el.classList.remove(cls);
            }
        }

        // inline style
        if (el.hasAttribute("ui-style")) {
            const [prop, key] = el.getAttribute("ui-style").split(":");
            if (prop && key) { // Ensure both parts exist
                el.style[prop] = state[key];
            }
        }

        // set arbitrary attributes
        // This loop iterates over all attributes of *every* element,
        // which can be slow. It's better to make this more targeted if possible,
        // but given the `ui-attr-` prefix, it's already somewhat targeted.
        for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i];
            if (attr.name.startsWith("ui-attr-")) {
                const htmlAttr = attr.name.slice("ui-attr-".length);
                const stateKey = attr.value;
                if (state.hasOwnProperty(stateKey)) {
                    el.setAttribute(htmlAttr, state[stateKey]);
                } else {
                    // Optionally, remove the attribute if stateKey is not found
                    el.removeAttribute(htmlAttr);
                }
            }
        }

        // two-way model binding
        // Only set the initial value here. The event listeners are set up once in initializeBindings.
        if (el.hasAttribute("ui-model")) {
            const key = el.getAttribute("ui-model");
            el.value = state[key] ?? "";
            // Ensure the event listener is set up only once
            setupTwoWayBinding(el, key, dispatch, false);
        }
        if (el.hasAttribute("ui-model.lazy")) {
            const key = el.getAttribute("ui-model.lazy");
            el.value = state[key] ?? "";
            // Ensure the event listener is set up only once
            setupTwoWayBinding(el, key, dispatch, true);
        }
    });

    // ui-loop elements are handled by renderLoops, which should be called after other binds
    // as it creates new elements that might contain ui-bind attributes
    renderLoops(state);
}

// This function should be called ONLY ONCE when your application initializes.
// It sets up global event listeners using delegation.
export function initializeBindings(dispatch) {
    initializeGlobalEventHandlers(dispatch);
    // Any other one-time setup
}