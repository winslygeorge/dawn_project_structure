// browserOps.js - Enhanced version with debugging
(function () {
    const wsConnections = {};
    const intervals = {};
    const rafHandles = {};
    const loadedModules = {};
    let debugMode = false;

    // Global client variable store
    const clientVars = {};

    // Enable debugging
    window.__enableClientOpsDebug__ = function(enable = true) {
        debugMode = enable;
        console.log(`Client ops debugging ${enable ? 'enabled' : 'disabled'}`);
    };

    function resolveTemplate(value, ctx = {}) {
        if (typeof value !== "string") return value;

        return value.replace(/{{\s*([^}]+)\s*}}/g, (_, expr) => {
            try {
                // Support nested paths like user.name or order.items[0].price
                const path = expr.split(".");
                let current = ctx;

                for (let part of path) {
                    // Handle array indexes like items[0]
                    const match = part.match(/^(\w+)\[(\d+)\]$/);
                    if (match) {
                        const [, key, index] = match;
                        current = current?.[key]?.[parseInt(index, 10)];
                    } else {
                        current = current?.[part];
                    }

                    if (current === undefined) break;
                }

                return current !== undefined ? current : "";
            } catch (e) {
                console.warn("[resolveTemplate] Failed to resolve", expr, "from ctx", ctx, e);
                return "";
            }
        });
    }

    async function resolveNestedOps(obj, path = 'root', ctx = {}) {
        if (debugMode) console.log(`resolveNestedOps:`, {path, obj});
        
        if (Array.isArray(obj)) {
            const results = [];
            for (let i = 0; i < obj.length; i++) {
                results.push(await resolveNestedOps(obj[i], `${path}[${i}]`, ctx));
            }
            return results;
        }
        
        if (obj && typeof obj === "object") {
            if (obj._op || obj._ops || obj._handler) {
                if (debugMode) console.log(`Executing client op at ${path}:`, obj);
                return await execClientOp(obj, ctx);
            }
            
            const out = {};
            for (const [k, v] of Object.entries(obj)) {
                out[k] = await resolveNestedOps(v, `${path}.${k}`, ctx);
            }
            return out;
        }
        
        // Resolve templates in strings
        if (typeof obj === "string") {
            return resolveTemplate(obj, ctx);
        }
        
        return obj;
    }

    // 🔎 Shared evaluator for complex/nested conditions (with ! support)
    async function evalCondition(cond, ctx = {}) {
        if (!cond) return false;

        // Handle NOT (unary negation)
        if (cond.operator === "!") {
            if (cond.value) {
                const val = typeof cond.value === "object"
                    ? await evalCondition(cond.value, ctx)
                    : resolveTemplate(cond.value, ctx);
                return !val;
            }
            if (cond.conditions && cond.conditions.length === 1) {
                return !(await evalCondition(cond.conditions[0], ctx));
            }
            console.warn("Invalid NOT condition format:", cond);
            return false;
        }

        // Handle nested logical groups
        if (cond.conditions && cond.operator) {
            const results = [];
            for (const sub of cond.conditions) {
                results.push(await evalCondition(sub, ctx));
            }
            switch (cond.operator) {
                case "&&": return results.every(Boolean);
                case "||": return results.some(Boolean);
                default:
                    console.warn("Unknown logical group operator:", cond.operator);
                    return false;
            }
        }

        // Handle binary condition
        let left = typeof cond.left === "object" ? await execClientOp(cond.left, ctx) : cond.left;
        let right = typeof cond.right === "object" ? await execClientOp(cond.right, ctx) : cond.right;
        
        // Resolve templates in condition values
        if (typeof left === "string") left = resolveTemplate(left, ctx);
        if (typeof right === "string") right = resolveTemplate(right, ctx);

        switch (cond.operator) {
            case "==": return left == right;
            case "===": return left === right;
            case "!=": return left != right;
            case "!==": return left !== right;
            case ">": return left > right;
            case ">=": return left >= right;
            case "<": return left < right;
            case "<=": return left <= right;
            default:
                console.warn("Unknown binary operator in condition:", cond.operator);
                return !!cond;
        }
    }

    function getElements(sel) {
        if (!sel) return [];
        if (Array.isArray(sel)) {
            return sel.flatMap(s => Array.from(document.querySelectorAll(s)));
        }
        return Array.from(document.querySelectorAll(sel));
    }

    async function execClientOp(op, ctx = {}) {
        if (!op || typeof op !== "object") {
            if (debugMode) console.warn('Invalid operation:', op);
            return;
        }

        if (debugMode) console.log('Executing operation:', op, 'with context:', ctx);

        // Batch ops
        if (Array.isArray(op._ops)) {
            if (debugMode) console.log('Processing batch of', op._ops.length, 'operations');
            for (const subOp of op._ops) {
                await execClientOp(subOp, ctx);
            }
            return;
        }

        // Handler operations (sendPatch, etc.)
        if (op._handler) {
            if (typeof window[op.fn] === 'function') {
                const evaluatedArgs = [];
                
                if (debugMode) console.log('Processing handler args:', op.args);
                
                for (let i = 0; i < (op.args || []).length; i++) {
                    const arg = op.args[i];
                    if (typeof arg === 'object' && (arg._op || arg._ops || arg._handler)) {
                        evaluatedArgs.push(await execClientOp(arg, ctx));
                    } else if (typeof arg === 'object') {
                        evaluatedArgs.push(await resolveNestedOps(arg, `args[${i}]`, ctx));
                    } else {
                        evaluatedArgs.push(resolveTemplate(arg, ctx));
                    }
                }

                if (debugMode) console.log('Calling handler:', op.fn, 'with args:', evaluatedArgs);
                
                return window[op.fn].apply(null, evaluatedArgs);
            }
            console.warn(`Function not found for handler: ${op.fn}`);
            return;
        }

        // Resolve selector templates if present
        const resolvedSelector = op.selector ? resolveTemplate(op.selector, ctx) : op.selector;
        const els = getElements(resolvedSelector);
        if (debugMode && resolvedSelector) {
            console.log(`Selector "${resolvedSelector}" found ${els.length} elements`);
        }

        switch (op._op) {
            // ===== DOM =====
            case "query": 
                return els[0] || null;
                
            case "getValue": 
                if (els[0]) {
                    const value = els[0].value;
                    if (debugMode) console.log(`getValue("${resolvedSelector}") =`, value);
                    return value;
                }
                if (debugMode) console.warn(`getValue("${resolvedSelector}") - no element found`);
                return undefined;
                
            case "setValue": 
                els.forEach(el => {
                    const resolvedValue = resolveTemplate(op.value, ctx);
                    if (debugMode) console.log(`setValue("${resolvedSelector}", "${resolvedValue}")`);
                    el.value = resolvedValue;
                });
                break;
                
            case "getText": 
                if (els[0]) {
                    const text = els[0].textContent;
                    if (debugMode) console.log(`getText("${resolvedSelector}") =`, text);
                    return text;
                }
                if (debugMode) console.warn(`getText("${resolvedSelector}") - no element found`);
                return undefined;
                
            case "setText": 
                els.forEach(el => {
                    const resolvedValue = resolveTemplate(op.value, ctx);
                    if (debugMode) console.log(`setText("${resolvedSelector}", "${resolvedValue}")`);
                    el.textContent = resolvedValue;
                });
                break;
                
            case "addClass": 
                els.forEach(el => {
                    const resolvedClassName = resolveTemplate(op.className, ctx);
                    if (debugMode) console.log(`addClass("${resolvedSelector}", "${resolvedClassName}")`);
                    el.classList.add(resolvedClassName);
                });
                break;
                
            case "removeClass": 
                els.forEach(el => {
                    const resolvedClassName = resolveTemplate(op.className, ctx);
                    if (debugMode) console.log(`removeClass("${resolvedSelector}", "${resolvedClassName}")`);
                    el.classList.remove(resolvedClassName);
                });
                break;
                
            case "show": 
                els.forEach(el => {
                    if (debugMode) console.log(`show("${resolvedSelector}")`);
                    el.style.display = "block";
                });
                break;
                
            case "hide": 
                els.forEach(el => {
                    if (debugMode) console.log(`hide("${resolvedSelector}")`);
                    el.style.display = "none";
                });
                break;
                
            case "setAttrs":
                els.forEach(el => {
                    if (op.attrs && typeof op.attrs === "object") {
                        for (let [k, v] of Object.entries(op.attrs)) {
                            const resolvedValue = resolveTemplate(v, ctx);
                            if (debugMode) console.log(`setAttr("${resolvedSelector}", "${k}", "${resolvedValue}")`);
                            if (resolvedValue === false || resolvedValue === null) {
                                el.removeAttribute(k);
                            } else if (resolvedValue === true) {
                                el.setAttribute(k, "");
                            } else {
                                el.setAttribute(k, resolvedValue);
                            }
                        }
                    }
                });
                break;

            // ===== Timers =====
            case "setTimeout":
                setTimeout(() => { if (op.callback) execClientOp(op.callback, ctx); }, op.ms);
                break;
            case "setInterval": {
                const id = op.id || String(Date.now());
                intervals[id] = setInterval(() => {
                    if (op.callback) execClientOp(op.callback, ctx);
                }, op.ms);
                break;
            }
            case "clearInterval":
                if (op.id && intervals[op.id]) {
                    clearInterval(intervals[op.id]);
                    delete intervals[op.id];
                }
                break;
            case "requestAnimationFrame": {
                const id = op.id || String(Date.now());
                rafHandles[id] = requestAnimationFrame(() => {
                    if (op.callback) execClientOp(op.callback, ctx);
                });
                break;
            }
            case "cancelAnimationFrame":
                if (op.id && rafHandles[op.id]) {
                    cancelAnimationFrame(rafHandles[op.id]);
                    delete rafHandles[op.id];
                }
                break;

            // ===== WebSocket =====
            case "wsConnect": {
                if (!op.id) throw new Error("wsConnect requires id");
                const resolvedUrl = resolveTemplate(op.url, ctx);
                const ws = new WebSocket(resolvedUrl);
                wsConnections[op.id] = ws;
                if (op.onMessage) {
                    ws.onmessage = e => execClientOp({ ...op.onMessage, data: e.data }, ctx);
                }
                if (op.onOpen) ws.onopen = () => execClientOp(op.onOpen, ctx);
                if (op.onClose) ws.onclose = () => execClientOp(op.onClose, ctx);
                if (op.onError) ws.onerror = () => execClientOp(op.onError, ctx);
                break;
            }
            case "wsSend":
                if (op.id && wsConnections[op.id]) {
                    const resolvedMessage = resolveTemplate(op.message, ctx);
                    wsConnections[op.id].send(resolvedMessage);
                }
                break;
            case "wsClose":
                if (op.id && wsConnections[op.id]) {
                    wsConnections[op.id].close();
                    delete wsConnections[op.id];
                }
                break;

            // ===== Fetch =====
            case "fetch":
                try {
                    const resolvedUrl = resolveTemplate(op.url, ctx);
                    const resolvedOptions = await resolveNestedOps(op.options || {}, 'fetch.options', ctx);
                    const res = await fetch(resolvedUrl, resolvedOptions);
                    const t = op.responseType || "text";
                    const data = await res[t]();
                    if (op.onSuccess) await execClientOp({ ...op.onSuccess, data }, ctx);
                } catch (err) {
                    if (op.onError) await execClientOp({ ...op.onError, error: String(err) }, ctx);
                }
                break;

            // ===== Storage =====
            case "localSet": 
                localStorage.setItem(op.key, resolveTemplate(op.value, ctx)); 
                break;
            case "localGet": return localStorage.getItem(op.key);
            case "localRemove": localStorage.removeItem(op.key); break;
            case "sessionSet": 
                sessionStorage.setItem(op.key, resolveTemplate(op.value, ctx)); 
                break;
            case "sessionGet": return sessionStorage.getItem(op.key);
            case "sessionRemove": sessionStorage.removeItem(op.key); break;

            case "setVar": {
                const val = typeof op.value === "object" ? await execClientOp(op.value, ctx) : resolveTemplate(op.value, ctx);
                clientVars[op.name] = val;
                console.debug("[setVar] Stored variable", op.name, "=", val);
                break;
            }

            case "getVar": {
                const val = clientVars[op.name];
                console.debug("[getVar] Retrieved variable", op.name, "=", val);
                return val;
            }

            // ===== Clipboard =====
            case "copyText": 
                await navigator.clipboard.writeText(resolveTemplate(op.text, ctx)); 
                break;
            case "readText": return await navigator.clipboard.readText();

            // ===== Notifications =====
            case "notify":
                if (typeof Notification !== "undefined") {
                    if (Notification.permission !== "granted") {
                        await Notification.requestPermission();
                    }
                    if (Notification.permission === "granted") {
                        const resolvedTitle = resolveTemplate(op.title || "Notification", ctx);
                        const resolvedBody = resolveTemplate(op.body || "", ctx);
                        new Notification(resolvedTitle, { body: resolvedBody });
                    }
                }
                break;

            // ===== External ES Modules =====
            case "importModule":
                if (!op.name || !op.url) throw new Error("importModule requires name and url");
                const resolvedModuleUrl = resolveTemplate(op.url, ctx);
                loadedModules[op.name] = await import(resolvedModuleUrl);
                break;

            case "callModuleFn": {
                if (!op.fn) throw new Error("callModuleFn requires fn");

                // Resolve module
                let targetModule;
                if (op.module) {
                    if (loadedModules[op.module]) {
                        targetModule = loadedModules[op.module];
                    } else if (typeof window !== "undefined" && window[op.module]) {
                        targetModule = window[op.module];
                    } else if (typeof globalThis !== "undefined" && globalThis[op.module]) {
                        targetModule = globalThis[op.module];
                    } else {
                        throw new Error("Module not found: " + op.module);
                    }
                } else {
                    // default to window/globalThis
                    targetModule = typeof window !== "undefined" ? window : globalThis;
                }

                // Resolve function
                const fn = targetModule[op.fn];
                if (typeof fn !== "function") {
                    throw new Error(`Function not found on module '${op.module || "global"}': ${op.fn}`);
                }

                // Resolve arguments
                const resolvedArgs = [];
                for (const arg of op.args || []) {
                    if (typeof arg === 'object' && (arg._op || arg._ops || arg._handler)) {
                        resolvedArgs.push(await execClientOp(arg, ctx));
                    } else if (typeof arg === 'object') {
                        resolvedArgs.push(await resolveNestedOps(arg, 'callModuleFn.arg', ctx));
                    } else {
                        resolvedArgs.push(resolveTemplate(arg, ctx));
                    }
                }

                // Execute
                const result = await fn.apply(targetModule, resolvedArgs);
                if (op.onResult) await execClientOp({ ...op.onResult, data: result }, ctx);
                break;
            }

            case "declareFunction":
                if (!op.name) throw new Error("declareFunction requires a name");
                if (!Array.isArray(op.params)) op.params = [];
                if (typeof op.body === "string") {
                    window[op.name] = new Function(...op.params, op.body);
                } else if (typeof op.body === "object") {
                    // Wrap client ops in a function
                    window[op.name] = function (...args) {
                        if (op.params && op.params.length) {
                            op.params.forEach((p, i) => { window[p] = args[i]; });
                        }
                        window.__clientOp__(op.body);
                    };
                } else {
                    throw new Error("Unsupported function body type");
                }
                break;
                
            case "if_": {
                const condition_result = op._complexCondition
                    ? await evalCondition(op.condition, ctx)
                    : (typeof op.condition === "object" ? await execClientOp(op.condition, ctx) : resolveTemplate(op.condition, ctx));

                if (condition_result) {
                    if (op.then) await execClientOp(op.then, ctx);
                } else {
                    if (op.else) await execClientOp(op.else, ctx);
                }
                break;
            }

            case "trim":
                let trim_op_result = await execClientOp(op.op, ctx);
                return typeof trim_op_result === 'string' ? trim_op_result.trim() : trim_op_result;
                
            // ===== Loop Operations =====
            case "while_loop": {
                let condition_result;
                while (true) {
                    condition_result = await evalCondition(op.condition, ctx);
                    if (!condition_result) break;

                    try {
                        await execClientOp(op.body, ctx);
                    } catch (e) {
                        if (e.__loopControl === "break") break;
                        if (e.__loopControl === "continue") continue;
                        throw e; // real error
                    }
                }
                break;
            }

            case "do_while_loop": {
                let condition_result;
                do {
                    await execClientOp(op.body, ctx);
                    condition_result = await evalCondition(op.condition, ctx);
                } while (condition_result);
                break;
            }

            case "loop_until": {
                let condition_result;
                while (true) {
                    await execClientOp(op.body, ctx);
                    condition_result = await evalCondition(op.condition, ctx);
                    if (condition_result) break;
                }
                break;
            }

            case "for_loop": {
                if (op.init) await execClientOp(op.init, ctx);

                while (true) {
                    const condition_result = op._complexCondition
                        ? await evalCondition(op.condition, ctx)
                        : (typeof op.condition === "object"
                            ? await execClientOp(op.condition, ctx)
                            : resolveTemplate(op.condition, ctx));

                    if (!condition_result) break;

                    try {
                        if (op.body) await execClientOp(op.body, ctx);
                    } catch (e) {
                        if (e.__loopControl === "break") break;
                        if (e.__loopControl === "continue") {
                            if (op.increment) await execClientOp(op.increment, ctx);
                            continue;
                        }
                        throw e;
                    }

                    if (op.increment) await execClientOp(op.increment, ctx);
                }
                break;
            }

            case "foreach_loop": {
                console.debug("[foreach_loop] Starting foreach loop", op);

                let collection;
                
                // Check if collection is a client operation that needs to be executed
                if (op.collection && typeof op.collection === "object" && 
                    (op.collection._op || op.collection._ops || op.collection._handler)) {
                    collection = await execClientOp(op.collection, ctx);
                } else {
                    // It's already a value (array, object, etc.)
                    collection = op.collection;
                }

                if (!collection) {
                    console.debug("[foreach_loop] Collection is null/undefined, skipping loop.");
                    break;
                }

                if (collection instanceof NodeList || collection instanceof HTMLCollection) {
                    console.debug("[foreach_loop] Converting NodeList/HTMLCollection to array, length:", collection.length);
                    collection = Array.from(collection);
                }

                if (Array.isArray(collection)) {
                    // console.debug("[foreach_loop] Iterating array, length:", collection.length);
                    for (let i = 0; i < collection.length; i++) {
                        const loopCtx = { ...ctx };
                        if (op.itemVar) loopCtx[op.itemVar] = collection[i];
                        if (op.indexVar) loopCtx[op.indexVar] = i;

                        // console.debug(`[foreach_loop] Array iteration ${i}`, {
                        //     value: collection[i],
                        //     loopCtx
                        // });

                        try {
                            await execClientOp(op.body, loopCtx);
                        } catch (e) {
                            if (e.__loopControl === "break") {
                                // console.debug("[foreach_loop] Break triggered, exiting loop at index:", i);
                                break;
                            }
                            if (e.__loopControl === "continue") {
                                // console.debug("[foreach_loop] Continue triggered, skipping index:", i);
                                continue;
                            }
                            console.error("[foreach_loop] Error in loop body at index:", i, e);
                            throw e;
                        }
                    }
                } else if (typeof collection === "object") {
                    console.debug("[foreach_loop] Iterating object keys:", Object.keys(collection));
                    for (const [key, value] of Object.entries(collection)) {
                        const loopCtx = { ...ctx };
                        if (op.itemVar) loopCtx[op.itemVar] = value;
                        if (op.indexVar) loopCtx[op.indexVar] = key;

                        // console.debug(`[foreach_loop] Object iteration key='${key}'`, {
                        //     value,
                        //     loopCtx
                        // });

                        try {
                            await execClientOp(op.body, loopCtx);
                        } catch (e) {
                            if (e.__loopControl === "break") {
                                // console.debug("[foreach_loop] Break triggered, exiting loop at key:", key);
                                break;
                            }
                            if (e.__loopControl === "continue") {
                                // console.debug("[foreach_loop] Continue triggered, skipping key:", key);
                                continue;
                            }
                            console.error("[foreach_loop] Error in loop body at key:", key, e);
                            throw e;
                        }
                    }
                } else {
                    console.warn("[foreach_loop] Unsupported collection type:", typeof collection, collection);
                }

                // console.debug("[foreach_loop] Loop finished");
                break;
            }

            // add maths module operations --add all operations
            case "math": {
                if (!op.fn) throw new Error("math operation requires fn");
                const args = [];
                for (const arg of op.args || []) {
                    if (typeof arg === 'object' && (arg._op || arg._ops || arg._handler)) {
                        args.push(await execClientOp(arg, ctx));
                    } else if (typeof arg === 'object') {
                        args.push(await resolveNestedOps(arg, 'math.arg', ctx));
                    } else {
                        args.push(resolveTemplate(arg, ctx));
                    }
                }
                switch (op.fn) {
                    case "sum": return args.reduce((a, b) => a + b, 0);
                    case "subtract": return args.reduce((a, b) => a - b);
                    case "multiply": return args.reduce((a, b) => a * b, 1);
                    case "divide": return args.reduce((a, b) => a / b);
                    case "mod": return args[0] % args[1];
                    case "pow": return Math.pow(args[0], args[1]);
                    case "sqrt": return Math.sqrt(args[0]);
                    case "abs": return Math.abs(args[0]);
                    case "min": return Math.min(...args);
                    case "max": return Math.max(...args);
                    case "round": return Math.round(args[0]);
                    case "floor": return Math.floor(args[0]);
                    case "ceil": return Math.ceil(args[0]);
                    case "random": 
                        if (args.length === 2) {
                            const [min, max] = args;
                            return Math.floor(Math.random() * (max - min + 1)) + min;
                        }
                        return Math.random();
                    default:
                        throw new Error("Unknown math function: " + op.fn);
                }
            }

            case "return": {
                const val = op.value
                    ? (typeof op.value === "object" ? await execClientOp(op.value, ctx) : resolveTemplate(op.value, ctx))
                    : undefined;
                throw { __return: true, value: val };
            }

            case "break": {
                throw { __loopControl: "break" };
            }

            case "continue": {
                throw { __loopControl: "continue" };
            }

            // ===== Type Conversion =====
            case "convert": {
                const value = await execClientOp(op.op, ctx);
                switch (op.targetType) {
                    case "string": return String(value);
                    case "number": return Number(value);
                    case "boolean": return Boolean(value);
                    case "json": 
                        try { return JSON.parse(value); } 
                        catch { return null; }
                    case "array": 
                        return Array.isArray(value) ? value : 
                            value ? [value] : [];
                    default: return value;
                }
            }

            // ===== Console Logging =====
            case "console": {
                const message = typeof op.message === 'object' ? 
                            await execClientOp(op.message, ctx) : 
                            resolveTemplate(op.message, ctx);
                
                switch (op.level) {
                    case "error": console.error(message); break;
                    case "warn": console.warn(message); break;
                    case "info": console.info(message); break;
                    case "debug": console.debug(message); break;
                    default: console.log(message);
                }
                break;
            }

            default:
                console.warn("Unknown client operation:", op);
        }
    }

    // Expose globally
    window.__clientOp__ = execClientOp;
    
    // Auto-enable debug if URL has debug parameter
    if (window.location.search.includes('debug=clientops')) {
        window.__enableClientOpsDebug__(true);
    }
})();