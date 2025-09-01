// patchClient.js
// ✅ Reactive HTML Client-Side Patching & Hydration with WS Subscription & Ping Support
// 🔄 Modified to process all patch types using the 'selector' field.
// --- Overlay Container with "Clear All" ---
function getOverlayContainer() {
    let container = document.querySelector("#__dawn_hmr_overlay__");
    if (!container) {
        container = document.createElement("div");
        container.id = "__dawn_hmr_overlay__";
        container.style.position = "fixed";
        container.style.top = "10px";
        container.style.right = "10px";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "6px";
        container.style.zIndex = "9999";
        document.body.appendChild(container);

        // --- Add "Clear All" bar ---
        const clearBar = document.createElement("div");
        clearBar.id = "__dawn_hmr_clear__";
        clearBar.style.display = "none"; // hidden until overlays exist
        clearBar.style.justifyContent = "flex-end";
        clearBar.style.alignItems = "center";
        clearBar.style.padding = "4px 8px";
        clearBar.style.fontSize = "12px";
        clearBar.style.color = "#fff";
        clearBar.style.background = "rgba(50,50,50,0.8)";
        clearBar.style.borderRadius = "4px";
        clearBar.style.cursor = "pointer";
        clearBar.style.fontFamily = "sans-serif";
        clearBar.textContent = "Clear All ✕";
        
        clearBar.addEventListener("click", () => {
            const toasts = container.querySelectorAll(".__dawn_toast__");
            toasts.forEach(t => t.remove());
            clearBar.style.display = "none";
        });

        container.appendChild(clearBar);
    }
    return container;
}

// --- Main Overlay Function ---
function showHotReloadOverlay(message, type = "info", duration = 3000, persist = false, details = null) {
    if (persist) {
        sessionStorage.setItem("__DAWN_LAST_RELOAD__", JSON.stringify({
            message,
            type,
            details,
            time: Date.now()
        }));
    }

    const container = getOverlayContainer();
    const clearBar = container.querySelector("#__dawn_hmr_clear__");

    // --- Limit overlays to 5 ---
    const MAX_OVERLAYS = 5;
    const toasts = container.querySelectorAll(".__dawn_toast__");
    if (toasts.length >= MAX_OVERLAYS) {
        toasts[0].remove(); // remove oldest
    }

    let overlay = document.createElement("div");
    overlay.className = "__dawn_toast__"; // mark as toast
    overlay.style.background = "rgba(0,0,0,0.7)";
    overlay.style.color = "white";
    overlay.style.padding = "8px 12px";
    overlay.style.fontSize = "14px";
    overlay.style.borderRadius = "6px";
    overlay.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    overlay.style.cursor = details ? "pointer" : "default";
    overlay.style.whiteSpace = "pre-line";
    overlay.style.maxWidth = "300px";
    overlay.style.position = "relative"; 
    overlay.style.transition = "all 0.4s ease";
    overlay.style.opacity = "0";
    overlay.style.transform = "translateX(100%)";

    // 🎨 Color by type
    switch (type) {
        case "success": overlay.style.background = "rgba(0,200,0,0.9)"; break;
        case "warn": overlay.style.background = "rgba(255,165,0,0.9)"; overlay.style.color = "black"; break;
        case "error": overlay.style.background = "rgba(200,0,0,0.9)"; break;
    }

    // --- Close button (×) ---
    let closeBtn = document.createElement("span");
    closeBtn.textContent = "×";
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "4px";
    closeBtn.style.right = "8px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.fontWeight = "bold";
    closeBtn.style.fontSize = "16px";
    closeBtn.style.color = overlay.style.color === "black" ? "#333" : "#fff";
    closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        overlay.remove();
        if (container.querySelectorAll(".__dawn_toast__").length === 0) {
            clearBar.style.display = "none";
        }
    });
    overlay.appendChild(closeBtn);

    // --- Summary ---
    let summaryEl = document.createElement("div");
    summaryEl.textContent = message;
    overlay.appendChild(summaryEl);

    // --- Expandable details ---
    if (details) {
        let detailsEl = document.createElement("div");
        detailsEl.style.marginTop = "6px";
        detailsEl.style.fontSize = "12px";
        detailsEl.style.display = "none";
        detailsEl.textContent = details;
        overlay.appendChild(detailsEl);

        overlay.addEventListener("click", (event) => {
            if (event.target !== closeBtn) {
                detailsEl.style.display = detailsEl.style.display === "block" ? "none" : "block";
            }
        });
    }

    // Insert after the Clear All bar
    container.appendChild(overlay);
    clearBar.style.display = "flex";

    // --- Staggered slide-in ---
    const index = container.querySelectorAll(".__dawn_toast__").length - 1;
    const staggerDelay = index * 100;

    setTimeout(() => {
        overlay.style.opacity = "1";
        overlay.style.transform = "translateX(0)";
    }, staggerDelay);

    // --- Auto fade/slide out ---
    setTimeout(() => {
        if (!document.body.contains(overlay)) return;
        overlay.style.opacity = "0";
        overlay.style.transform = "translateX(100%)";
        setTimeout(() => {
            overlay.remove();
            if (container.querySelectorAll(".__dawn_toast__").length === 0) {
                clearBar.style.display = "none";
            }
        }, 400);
    }, duration + staggerDelay);
}
// Add to your existing WebSocket client:


let currentComponentKey = null;

let isdebug = false;

window.__reactiveComponentInstance__ = {state: {__shared: window.__INITIAL_STATE__ || {},__client: {}}};

// Helper for creating VDOM nodes (Kept for compatibility)
function h(tag, attrs, children) {
    const node = { tag, attrs: attrs || {} };
    if (typeof children === 'string' || typeof children === 'number') {
        node.content = String(children);
    } else if (Array.isArray(children)) {
        node.children = children;
    }
    return node;
}

// --- Reactive Variable Updates (Primary Patch Handler) ---

function isEmptyValue(value) {
    if (value == null) return true; // null or undefined
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

window.__updateReactiveVar__ = function (varName, value) {
    // Skip rendering if value exists but is empty
    if (isEmptyValue(value)) {
        const elements = document.querySelectorAll(`[data-bind="${varName}"]`);
        elements.forEach(el => el.innerHTML = '');
        return;
    }

    const elements = document.querySelectorAll(`[data-bind="${varName}"]`);

    elements.forEach(el => {
        if (Array.isArray(value)) {
            const templateId = el.getAttribute('data-template-id') || el.getAttribute('data-template');
            if (!templateId) {
                console.warn(`No template ID found for list variable: ${varName}`);
                return;
            }
            patchHandlers.list(el, {
                type: "list",
                items: value,
                template: templateId
            });
            return;
        }

        if (value && typeof value === 'object') {
            const templateId = el.getAttribute('data-template-id') || el.getAttribute('data-template');
            if (!templateId) {
                console.warn(`No template ID found for object variable: ${varName}`);
                return;
            }
            patchHandlers.object(el, {
                type: "object",
                object: value,
                template: templateId
            });
            return;
        }

        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
            el.value = value != null ? String(value) : "";
        } else {
            el.textContent = value != null ? String(value) : "";
        }
    });
};


// --- Form Binding ---
window.__initializeReactiveInputs__ = function () {
    if (window.__reactiveInputsInitialized__) return;
    window.__reactiveInputsInitialized__ = true;

    let inputTimeout;
    document.body.addEventListener('input', function (event) {
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(() => {
            const target = event.target;
            const bindName = target.getAttribute('data-bind');
            if (bindName && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
                const key = window.__DEFAULT_COMPONENT_KEY__ || 'counterApp';
                if (window.sendPatch) {
                    window.sendPatch(key, 'setFormField', [bindName, target.value]);
                } else {
                    console.warn("window.sendPatch not defined.");
                }
            }
        }, 50);
    });
};

// --- Template Store & Renderer ---
const TemplateStore = {
    cache: {},
    get(templateIdOrHTML) {
        if (!templateIdOrHTML) return null;
        if (typeof templateIdOrHTML === "string" && templateIdOrHTML.trim().startsWith("<")) {
            return templateIdOrHTML;
        }
        if (this.cache[templateIdOrHTML]) {
            return this.cache[templateIdOrHTML];
        }
        const templateEl = document.querySelector(`template[data-template-id="${templateIdOrHTML}"]`);
        if (templateEl) {
            const template = templateEl.innerHTML;
            this.cache[templateIdOrHTML] = template;
            return template;
        }
        return null;
    }
};

function renderTemplate(template, data) {
    let html = template;
    for (const key in data) {
        if (typeof data[key] !== 'object' || data[key] === null) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            html = html.replace(regex, data[key] != null ? String(data[key]) : "");
        }
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const element = doc.body.firstChild;
    for (const key in data) {
        if (typeof data[key] !== 'object' || data[key] === null) {
            const bindEl = element.querySelector(`[data-bind="${key}"]`);
            if (bindEl) {
                if (['INPUT', 'TEXTAREA', 'SELECT'].includes(bindEl.tagName)) {
                    bindEl.value = data[key];
                } else {
                    bindEl.textContent = data[key];
                }
            }
        }
    }
    return element;
}

// --- Patch Manager ---
const PatchManager = (() => {
    let queue = [];
    let scheduled = false;

    function flush() {
        scheduled = false;
        document.body.classList.add("patching");
        queue.forEach(patch => {
            try {
                applyPatch(patch);
            } catch (err) {
                console.error("Failed to apply patch:", patch, err);
            }
        });
        queue = [];
        requestAnimationFrame(() => {
            document.body.classList.remove("patching");
        });
    }

    function scheduleFlush() {
        if (!scheduled) {
            scheduled = true;
            requestAnimationFrame(flush);
        }
    }

    return {
        enqueueBatch(patches) {
            if (Array.isArray(patches)) {
                queue.push(...patches);
            } else if (patches) {
                queue.push(patches);
            }
            scheduleFlush();
        },
        flushNow: flush
    };
})();

const originalFlush = PatchManager.flushNow;
PatchManager.flushNow = function () {
    originalFlush();
    requestAnimationFrame(() => {
        window.showDebugState?.();
    });
};

window.showDebugState = function () {
    const instance = window.__reactiveComponentInstance__;
    if (!instance || !instance.state) return console.warn("No state available yet.");
    const debugEl = document.querySelector("#__debug_state__");
    if (!debugEl) return console.warn("Debug panel not found.");
    const stateDump = {
        shared: instance.state.__shared || {},
        client: instance.state.__client || {}
    };
    debugEl.textContent = JSON.stringify(stateDump, null, 2);
};

// --- Core Patch Application ---
const patchHandlers = {
    "attr": (target, patch) => {
        if (patch.key && patch.value !== undefined) target.setAttribute(patch.key, patch.value);
    },
    "remove-attr": (target, patch) => {
        if (patch.key) target.removeAttribute(patch.key);
    },
    "text": (target, patch) => {
        if (!target.hasAttribute('data-bind')) {
            target.textContent = patch.content != null ? String(patch.content) : "";
        }
    },
    "replace": (target, patch) => {
        const parser = new DOMParser();
        const newEl = parser.parseFromString(patch.newHTML || '', "text/html").body.firstElementChild;
        if (newEl) target.replaceWith(newEl);
    },
    "remove": (target) => {
        target.remove();
    },

    // === UPDATED LIST PATCH ===
    "list": (target, patch) => {
        if (isEmptyValue(patch.items)) { target.innerHTML = ''; return; }
        const newItems = patch.items || [];
        const template = TemplateStore.get(patch.template);
        console.debug("Applying list patch:", patch, "Template:", template);
        if (!template) {
            return console.warn("List template not found or invalid.");
        }

        const animationClasses = patch.classes || ["transition", "duration-300", "opacity-0"];
        const staggerDelay = patch.staggerDelay || 0;

        const existingItemsMap = new Map();
        Array.from(target.children).forEach(el => {
            existingItemsMap.set(el.getAttribute("data-key"), el);
        });

        const usedKeys = new Set();

        newItems.forEach((item, index) => {
            let rawKey = item.key || item.id || item._id;
            if (!rawKey) {
                console.error("❌ List item is missing a stable key/id. Skipping item:", item);
                return;
            }
            const keyStr = String(rawKey);
            usedKeys.add(keyStr);

            const existingEl = existingItemsMap.get(keyStr);

            if (existingEl) {
                for (const prop in item) {
                    if (prop !== "key" && typeof item[prop] !== "object") {
                        const bindEl = existingEl.querySelector(`[data-bind="${prop}"]`);
                        if (bindEl) {
                            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(bindEl.tagName)) {
                                bindEl.value = item[prop];
                            } else {
                                bindEl.textContent = item[prop];
                            }
                        }
                    }
                }
                if (target.children[index] !== existingEl) {
                    console.debug(`🔄 Moving element with key ${keyStr} to position ${index}`);
                    target.insertBefore(existingEl, target.children[index] || null);
                }
            } else {
                const renderedItem = renderTemplate(template, item);
                if (renderedItem) {
                    renderedItem.setAttribute('data-key', keyStr);
                    renderedItem.classList.add(...animationClasses);
                    target.insertBefore(renderedItem, target.children[index] || null);
                    setTimeout(() => renderedItem.classList.remove(...animationClasses), staggerDelay * index);
                    console.debug(`➕ Inserted new item with key ${keyStr}`);
                }
            }
        });

        console.debug("target.children:", Array.from(target.children).map(el => el.getAttribute("data-key")));

          // patchClient.js (inside the 'list' patch handler)
Array.from(target.children).forEach(el => {
    const key = el.getAttribute("data-key");
    // Check if the DOM element's key exists in the new list of items
    if (!usedKeys.has(key)) {
        console.debug(`🗑️ Removing item with key ${key}`);
        // Directly remove the element from the DOM
        el.remove();
    }
});

        const domKeys = Array.from(target.children).map(el => el.getAttribute("data-key"));
        console.debug("🔍 DOM keys after patch:", domKeys, "| Patch keys:", Array.from(usedKeys));
    },

    "object": (target, patch) => {
        if (isEmptyValue(patch.object)) { target.innerHTML = ''; return; }
        const template = TemplateStore.get(patch.template) || patch.template;
        if (!template) {
            return console.warn("Object template not found or invalid.");
        }
        const renderedObject = renderTemplate(template, patch.object);
        if (renderedObject) {
            target.innerHTML = '';
            target.appendChild(renderedObject);
        }
    },
    "nested": (target, patch) => {
        const path = patch.path;
        const value = patch.value;
        const nestedSelector = `${patch.selector} [data-bind="${path}"]`;
        const nestedEl = document.querySelector(nestedSelector);
        if (nestedEl) {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(nestedEl.tagName)) {
                nestedEl.value = value;
            } else {
                nestedEl.textContent = value;
            }
        } else {
            console.warn(`Nested element not found for path: ${path}`);
        }
    }
};

function applyPatch(patch) {
    if (!patch || typeof patch !== 'object' || !patch.type) {
        console.warn("⚠️ Skipping invalid patch:", patch);
        return;
    }
    if (patch.type === "update-var") {
        // display overlay notification
        showHotReloadOverlay(
            `🔄 Updating variable: ${patch.varName}`,
            "info",
            3000,
            false,
            `New value: ${patch.value}`
        );
        window.__updateReactiveVar__(patch.varName, patch.value);
        return;
    }
    const handler = patchHandlers[patch.type];
    if (handler) {
        const target = document.querySelector(patch.selector);
        if (!target) {
           if(isdebug) console.warn("⚠️ Target not found for selector:", patch.selector, "Patch:", patch);
            return;
        }
        handler(target, patch);
        //display overlay notification
        showHotReloadOverlay(
            `🔄 Applying patch: ${patch.type}`,
            "info",
            3000,
            false,
            `Patch details: ${JSON.stringify(patch)}`
        );
    } else {
        console.warn(`⚠️ Unknown patch type: ${patch.type}`);
    }
}

// --- Hydration ---
function waitForReactiveInstance(retries = 10, delay = 100) {
    if (window.__reactiveComponentInstance__) return Promise.resolve(window.__reactiveComponentInstance__);
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const timer = setInterval(() => {
            if (window.__reactiveComponentInstance__) {
                clearInterval(timer);
                resolve(window.__reactiveComponentInstance__);
            } else if (++attempts >= retries) {
                clearInterval(timer);
                reject("Timeout waiting for __reactiveComponentInstance__");
            }
        }, delay);
    });
}

async function applyInitialState(globalState = {}, clientState = {}) {
    if(isdebug) console.info("Hydrating state → global:", globalState, "client:", clientState);
    try {
        const instance = await waitForReactiveInstance();
        instance.state.__shared = instance.state.__shared || {};
        instance.state.__client = instance.state.__client || {};
        Object.assign(instance.state.__shared, globalState);
        Object.assign(instance.state.__client, clientState);
        for (const varName in instance.state.__shared) {
            window.__updateReactiveVar__(varName, instance.state.__shared[varName]);
        }
        for (const varName in instance.state.__client) {
            window.__updateReactiveVar__(varName, instance.state.__client[varName]);
        }
        window.__initializeReactiveInputs__();
        window.__onHydrationComplete__?.();
        window.showDebugState?.();
    } catch (e) {
        console.error("Hydration failed:", e);
    }
}

// --- Local State Management ---
function useLocalState(initialState) {
    let state = initialState;
    const listeners = [];
    function setState(newState) {
        state = { ...state, ...newState };
        listeners.forEach(listener => listener(state));
    }
    function subscribe(listener) {
        listeners.push(listener);
    }
    return [state, setState, subscribe];
}
window.__useLocalState__ = useLocalState;

const userId = window.__USER_ID__ || "guest-" + Math.random().toString(36).slice(2);

// --- WebSocket Setup ---
const WS_URL = 'ws://' + window.location.host + '/ws?user_id=' + encodeURIComponent(userId);
let ws;
let subscribed = false;

function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    ws = new WebSocket(WS_URL);
    // Initialize

    ws.onopen = () => {
        console.log("✅ WebSocket connected");
        ws.send(JSON.stringify({
            topic: "patch",
            event: "subscribe",
            payload: {
                component_key: window.__DEFAULT_COMPONENT_KEY__ || "counterApp",
                path: null
            },
            user_id: userId
        }));
        subscribed = true;
    };
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            switch (message.type) {
                case 'patches': {
                    const patches = Array.isArray(message.data) ? message.data : [message.data];
                    PatchManager.enqueueBatch(patches);
                    break;
                }
                case "set-component-key": {
                    window.__DEFAULT_COMPONENT_KEY__ = message.key;
                   if(isdebug) console.debug("Component key set to", window.__DEFAULT_COMPONENT_KEY__);
                    break;
                }
                case 'set-state':
                    applyInitialState(
                        message.payload?.state || {},
                        message.payload?.client_state || {}
                    );
                    break;
                case 'update-var':
                    window.__updateReactiveVar__(message.varName, message.value);
                    break;
                case 'execute-js':
                    new Function(message.data)();
                    break;
                case 'pong':
                    if(isdebug) console.log("🟢 Pong received:", message.payload?.time);
                    break;
                case 'subscribed_to_patches':
                   if(isdebug) console.log("🔔 Subscribed with filters:", message.payload?.filters);
                    break;
                case 'ping': 
                   if(isdebug) console.log("📡 Ping received from server");
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            topic: '__default__',
                            event: 'pong',
                            type: 'pong',
                            payload: { time: Date.now() }
                        }));
                    }
                    break;
                case 'notification': 
                    if(isdebug) console.debug(`🔔 System notification [${message.event || 'unknown'}]:`, message.payload);
                    break;
                case 'reload':
                    location.reload();
                    showHotReloadOverlay(
                        'Page is reloading...',
                        'info',
                        3000,
                        false,
                        JSON.stringify(message.files, null, 2)
                    );
                    break;
                default:
                    console.warn("⚠️ Unknown message type:", message);
            }
        } catch (e) {
            console.error("WebSocket message error:", e, event.data);
        }
    };
    ws.onclose = () => {
        console.warn("⚠️ WebSocket closed. Reconnecting...");
        subscribed = false;
        setTimeout(connectWebSocket, 2000);
    };
    ws.onerror = (event) => {
        console.error("WebSocket error:", event);
        ws.close();
    };
}

// --- Method Call Sender ---
window.sendPatch = function (component_key, methodName, args = []) {
   if(isdebug) console.debug(`📤 Sending patch: ${methodName} with args:`, args, "for component:", component_key);
    // check if args is JSON object --if so strigify the args other wise just send the args as it is
    // if (typeof args === "object") {
    //     args = JSON.stringify(args);
    // }
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            topic: "patch",
            event: "process_client_action",
            payload: {
                method: methodName,
                args: args,
                component_key: component_key
            },
            user_id: userId
        }));
    } else {
        console.warn("WebSocket not open. Cannot send:", methodName);
    }
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    window.__setInitialState__ = applyInitialState;
    connectWebSocket();
    if (window.__INITIAL_STATE__) {
        applyInitialState(window.__INITIAL_STATE__);
    }
});
