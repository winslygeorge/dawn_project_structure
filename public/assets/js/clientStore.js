let currentState = {};
let previousState = {};
const subscribers = [];
const reducers = {};
const middlewares = [];
const persistSlices = {};
const stateHistory = [];
const MAX_SLICE_SIZE_KB = 100;
let compressionLib = null;

// Event Hook System
const eventBus = {};
export function on(event, cb) {
  (eventBus[event] ||= []).push(cb);
}
function emit(event, data) {
  (eventBus[event] || []).forEach(fn => fn(data));
}

// DevTools
let devToolsEnabled = false;
let trackHistory = true;
let maxHistory = 50;
export function enableDevTools({ log = true, history = true, max = 50 } = {}) {
  devToolsEnabled = log;
  trackHistory = history;
  maxHistory = max;
}
export function getStateHistory() {
  return [...stateHistory];
}
export function undoState() {
  if (stateHistory.length > 1) {
    stateHistory.pop();
    const { state } = stateHistory[stateHistory.length - 1];
    currentState = { ...state };
    notifySubscribers();
  }
}

// Optional: inject compression lib if needed
export function setCompressionLib(lib) {
  compressionLib = lib;
}

export function initializeStore(initialState = {}) {
  currentState = { ...initialState };
  previousState = { ...initialState };
  notifySubscribers();
  persistStateSlices();
}

export function registerReducer(actionType, reducerFn) {
  reducers[actionType] = reducerFn;
}

export function useMiddleware(fn) {
  if (typeof fn === "function") middlewares.push(fn);
}

function applyMiddleware(action) {
  for (const fn of middlewares) {
    const result = fn(action, currentState, dispatch, getState);
    if (result === false) return false;
  }
  return true;
}

function logAction(action, oldState, newState) {
  if (devToolsEnabled) {
    console.group(`[clientStore] Action: ${action.type}`);
    console.log("Prev:", oldState);
    console.log("Next:", newState);
    console.groupEnd();
  }
  if (trackHistory) {
    stateHistory.push({ action, state: newState });
    if (stateHistory.length > maxHistory) stateHistory.shift();
  }
}

function notifySubscribers() {
  for (const cb of subscribers) {
    try {
      cb({ ...currentState });
    } catch (e) {
      console.error("[clientStore] Subscriber error:", e);
    }
  }
}

export function unsubscribeAll() {
  subscribers.length = 0;
}

export function getState() {
  return { ...currentState };
}

export async function dispatch(action) {
  if (!action?.type) return console.warn("Invalid action");
  if (!applyMiddleware(action)) return;

  const reducer = reducers[action.type];
  if (typeof reducer === "function") {
    const result = reducer(currentState, action);
    const newState = result instanceof Promise ? await result : result;

    if (newState !== currentState) {
      logAction(action, currentState, newState);
      currentState = newState;
      notifySubscribers();
      persistStateSlices();
    }
  } else {
    console.warn("No reducer for type:", action.type);
  }
}

export function subscribe(cb) {
  if (typeof cb === "function") {
    subscribers.push(cb);
    cb(currentState);
    return () => {
      const idx = subscribers.indexOf(cb);
      if (idx >= 0) subscribers.splice(idx, 1);
    };
  }
  return () => {};
}

export function hydrateStore(serverState) {
  currentState = { ...currentState, ...serverState };
  previousState = { ...currentState };
  notifySubscribers();
}

export function enablePersistenceSlice(key, { ttlSeconds = null, compressed = false } = {}) {
  persistSlices[key] = { ttl: ttlSeconds, compressed, timestamp: Date.now() };

  const raw = safeStorageGet(key);
  if (!raw) return;

  try {
    const decoded = compressed && compressionLib
      ? compressionLib.decompressFromUTF16(raw)
      : raw;

    let json;
    try {
      json = JSON.parse(decoded);
    } catch (e) {
      json = { value: decoded };
    }

    if (ttlSeconds && Date.now() - (json.__timestamp || 0) > ttlSeconds * 1000) {
      safeStorageSet(key, null);
      emit("persist:expired", key);
      return;
    }

    if (json.hasOwnProperty('value')) {
      currentState = { ...currentState, [key]: json.value };
    } else {
      delete json.__timestamp;
      currentState = { ...currentState, [key]: json };
    }

    previousState = { ...currentState };
    emit("persist:hydrated", key);
  } catch (e) {
    console.warn("Failed to hydrate slice:", key, e);
    emit("persist:failed", { key, error: e });
  }
}

function persistStateSlices() {
  const changed = jsonDiff(previousState, currentState);
  for (const key in persistSlices) {
    if (!changed.hasOwnProperty(key)) continue;

    const { compressed } = persistSlices[key];
    let serialized;
    try {
      const valueToStore = currentState[key];
      if (typeof valueToStore === 'object' && valueToStore !== null && !Array.isArray(valueToStore)) {
        serialized = JSON.stringify({ ...valueToStore, __timestamp: Date.now() });
      } else {
        serialized = JSON.stringify({ value: valueToStore, __timestamp: Date.now() });
      }

      if (compressed && compressionLib)
        serialized = compressionLib.compressToUTF16(serialized);

      const sizeKB = serialized.length / 1024;
      if (sizeKB > MAX_SLICE_SIZE_KB)
        console.warn(`[clientStore] "${key}" exceeds safe size (${sizeKB.toFixed(1)}KB)`);

      safeStorageSet(key, serialized);
      emit("persist:done", key);
    } catch (e) {
      console.error("Persist error:", key, e);
      emit("persist:failed", { key, error: e });
    }
  }
  previousState = { ...currentState };
}

function jsonDiff(oldObj, newObj) {
  const diff = {};
  for (const key in newObj) {
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      diff[key] = newObj[key];
    }
  }
  return diff;
}

export function applyPatch(obj, patch) {
  for (const key in patch) obj[key] = patch[key];
  return obj;
}

function safeStorageSet(key, val) {
  try {
    const str = typeof val === 'string' ? val : JSON.stringify(val);
    if (window.localStorage) localStorage.setItem(key, str);
    else if (window.sessionStorage) sessionStorage.setItem(key, str);
    else document.cookie = `${key}=${btoa(str)}; path=/; max-age=31536000`;
  } catch (err) {
    console.warn("Failed to persist:", key, err);
  }
}

function safeStorageGet(key) {
  try {
    if (window.localStorage && localStorage.getItem(key)) return localStorage.getItem(key);
    if (window.sessionStorage && sessionStorage.getItem(key)) return sessionStorage.getItem(key);

    const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
    if (match) return atob(match[2]);
  } catch (_) {}
  return null;
}

// DOM Binding System
export function bindUIToStore() {
  const bindings = [];
  document.querySelectorAll("[ui-bind]").forEach(el => {
    const fullKey = el.getAttribute("ui-bind");
    const [rawKey, modifier] = fullKey.split("|");
    bindings.push({ el, key: rawKey.trim(), mod: modifier?.trim(), template: el.innerHTML });
  });

  const updateBindings = (state) => {
    bindings.forEach(({ el, key, mod, template }) => {
      const value = getNestedValue(state, key);
      if (typeof value === "undefined") return;

      if (!mod || mod === "text") el.textContent = value;
      else if (mod === "html") el.innerHTML = value;
      else if (mod === "value") el.value = value;
      else if (mod.startsWith("class:")) el.classList.toggle(mod.split(":")[1], !!value);
      else if (mod.startsWith("style:")) el.style[mod.split(":")[1]] = value;
      else if (mod.startsWith("attr:")) el.setAttribute(mod.split(":")[1], value);
      else if (mod.startsWith("each:")) {
        el.innerHTML = "";
        if (Array.isArray(value)) {
          value.forEach((item, idx) => {
            const node = document.createElement("div");
            node.innerHTML = template.replace(/\{\{(.*?)\}\}/g, (_, k) => item[k.trim()] ?? "");
            el.appendChild(node);
          });
        }
      }
    });
  };

  subscribe(updateBindings);
  updateBindings(currentState);
}

function getNestedValue(obj, path) {
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
}
