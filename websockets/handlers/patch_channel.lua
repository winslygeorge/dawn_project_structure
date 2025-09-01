-- Patch Channel WebSocket Handler
-- This module handles WebSocket connections for patch subscriptions,
local cjson = require("dkjson")
local uuid = require("utils.uuid")
local log_level = require("utils.logger").LogLevel

-- Assume a global logger or pass it in 'shared'
-- For demonstration, let's create a simple logger if none exists
local logger = {
    info = function(...) print("INFO:", ...) end,
    warn = function(...) print("WARN:", ...) end,
    error = function(...) print("ERROR:", ...) end,
    debug = function(...) print("DEBUG:", ...) end,
}

-- Utility functions
local function split_comma_list(val)
    if type(val) == "string" and #val > 0 then
        local t = {}
        for item in val:gmatch("[^,]+") do
            table.insert(t, item)
        end
        return t
    elseif type(val) == "table" then
        return val
    end
    return nil
end

local function safe_redis_decode(json_str)
    if not json_str then return nil end
    local success, decoded = pcall(cjson.decode, json_str)
    if not success then
        logger.error("Failed to decode JSON from Redis: ", decoded)
        return nil
    end
    return decoded
end

local function safe_redis_encode(data)
    local success, encoded = pcall(cjson.encode, data)
    if not success then
        logger.error("Failed to encode JSON for Redis: ", encoded)
        return nil
    end
    return encoded
end

-- PatchWSHandler Class
local PatchWSHandler = {}
PatchWSHandler.__index = PatchWSHandler

function PatchWSHandler:new()
    return setmetatable({}, PatchWSHandler)
end

-- shouldSend logic
local function shouldSend(patch, filters)

    if not filters then return true end

    if filters.component and patch.component then
        local ok = false
        for _, allowed in ipairs(filters.component) do
            if patch.component == allowed or patch.component:sub(1, #allowed) == allowed then
                ok = true; break
            end
        end
        if not ok then return false end
    end

    if filters.not_component and patch.component then
        for _, blocked in ipairs(filters.not_component) do
            if patch.component == blocked or patch.component:sub(1, #blocked) == blocked then
                return false
            end
        end
    end

    if filters.path and patch.path then
        if not (patch.path:sub(1, #filters.path) == filters.path) then return false end
    end

    if filters.not_path and patch.path then
        if (patch.path:sub(1, #filters.not_path) == filters.not_path) then return false end
    end

    return true
end

-- Register dispatcher (formerly broadcast loop)
function PatchWSHandler:start_broadcast_loop(_, _, _, shared, _, presence)
    local handler_self = self

    self.server.patch_queue:on_push(function(patch)
        local active_ws_ids, err = presence.redis:smembers("active_subscribers_set")
        if not active_ws_ids then
            -- replace logger with your actual logger
            self.server.logger:log(log_level.ERROR, string.format("Redis SMEMBERS failed: %s", err), "PatchWSHandler", "start_broadcast_loop")
            return
        end

        if #active_ws_ids == 0 then return end

        local keys = {}
        for _, id in ipairs(active_ws_ids) do
            table.insert(keys, "subscriber:" .. id)
        end

        local sub_jsons, err = presence.redis:mget(unpack(keys))
        if not sub_jsons then
            self.server.logger:log(log_level.ERROR, string.format("Redis MGET failed: %s", err), "PatchWSHandler", "start_broadcast_loop")
            return
        end

        local timestamp_updates = {}
        local current_time = os.time()

        for i, json in ipairs(sub_jsons) do
            local ws_id = active_ws_ids[i]
            if not json then
                presence.redis:srem("active_subscribers_set", ws_id)
            else
                local sub = safe_redis_decode(json)
                if sub and shouldSend(patch, sub.filters) then
                    shared.sockets:send_to_user(ws_id, {
                        id = uuid.v4(),
                        type = "patches",
                        data = patch
                    })
                    table.insert(timestamp_updates, ws_id)
                    table.insert(timestamp_updates, current_time)
                end
            end
        end

        if #timestamp_updates > 0 then
            local ok, err = presence.redis:hmset("global_last_patch_time", unpack(timestamp_updates))
            if not ok then
                self.server.logger:log(log_level.ERROR, string.format("Failed to update timestamps: %s", err), "PatchWSHandler", "start_broadcast_loop")
            else
                presence.redis:expire("global_last_patch_time", 86400)
            end
        end
    end)

    self.server.logger:log(log_level.INFO, "Patch dispatcher registered (event-driven, no loop)", "PatchWSHandler", "start_broadcast_loop")
end

-- All other methods (subscribe, unsubscribe, process_client_action, ping)
-- remain unchanged, except you now call PatchQueue:push(patch) and it will fire instantly

-- Inside PatchWSHandler:subscribe...
function PatchWSHandler:subscribe(ws, payload, state, shared, topic, presence)
    local ws_id = shared.sockets:safe_get_ws_id(ws)
    local comp_key = payload.component_key or "app_component_instance"

    local filters = {
        component_key = comp_key,
        filters = {
            component = split_comma_list(payload.component),
            not_component = split_comma_list(payload.not_component),
            path = payload.path,
            not_path = payload.not_path
        }
    }

    local sub_key = "subscriber:" .. ws_id
    local encoded_filters = safe_redis_encode(filters)
    if encoded_filters then
        local ok, err = presence.redis:set(sub_key, encoded_filters)
        if ok then presence.redis:expire(sub_key, 86400) end
    end
    presence.redis:sadd("active_subscribers_set", ws_id)

    -- Retrieve global state
    local redis_state = presence:retrieve_state("component_state:" .. comp_key)

    -- Retrieve client-specific state
    local client_state_key = string.format("client_state:%s:%s", comp_key, ws_id)
    local redis_client_state = presence:retrieve_state(client_state_key)

    local comp = self.server:get_component(comp_key) or {}
    if  comp.onJoin then
        comp:onJoin(ws_id)
    end
    
    comp.state = redis_state or {}
    comp.client_states = comp.client_states or {}
    comp.client_states[ws_id] = redis_client_state or {}

    shared.sockets:push_notification(ws, {
        id = uuid.v4(),
        type = "set-state",
        event = "initial_state",
        payload = {
            state = comp.state,
            client_state = comp.client_states[ws_id],
            timestamp = os.time()
        }
    })

    -- Replay unseen patches
    local patch_key = "component_patch_log:" .. comp_key
    local patch_log_json, err_lrange = presence.redis:lrange(patch_key, 0, 50)
    if not patch_log_json then
        self.server.logger:log(log_level.ERROR, string.format("Redis LRANGE failed for patch log %s: %s", patch_key, err_lrange), "PatchWSHandler", "start_broadcast_loop")
        patch_log_json = {} -- Ensure it's a table to avoid errors below
    end

    local last_seen_id = payload.last_patch_id
    local replaying = (last_seen_id == nil)

    for _, patch_json_str in ipairs(patch_log_json) do
        local patch_entry = safe_redis_decode(patch_json_str)
        if patch_entry and patch_entry.patch then
            local patch_id = patch_entry.patch.id

            if not replaying and patch_id == last_seen_id then
                replaying = true
            elseif replaying then
                shared.sockets:send_to_user(ws_id, {
                    id = uuid.v4(),
                    type = "patches",
                    data = { patch_entry.patch }
                })
            end
        else
            self.server.logger:log(log_level.WARN, string.format("Skipping malformed patch entry in log for %s: %s", patch_key, patch_json_str), "PatchWSHandler", "start_broadcast_loop")
        end
    end

    shared.sockets:push_notification(ws, {
        id = uuid.v4(),
        event = "subscribed_to_patches",
        payload = { component_key = comp_key, filters = filters.filters }
    })

    self.server.logger:log(log_level.INFO, string.format("Client %s subscribed to '%s'", ws_id, comp_key), "PatchWSHandler", "start_broadcast_loop")
end

-- Optimized unsubscribe function
function PatchWSHandler:unsubscribe(ws, payload, state, shared, topic, presence)
    --first check if the WebSocket is valid
    
    local ws_id = shared.sockets:safe_get_ws_id(ws) or shared.WebSocket_tocleanup
    local sub_key = "subscriber:" .. ws_id

    -- 1️⃣ Remove Redis subscription entry
    local ok_del, err_del = presence.redis:del(sub_key)
    if not ok_del then
        self.server.logger:log(log_level.ERROR, string.format(
            "Redis DEL failed for subscriber key %s: %s", sub_key, err_del
        ), "PatchWSHandler", "unsubscribe")
    end

    -- 2️⃣ Remove from active subscribers set
    local ok_srem, err_srem = presence.redis:srem("active_subscribers_set", ws_id)
    if not ok_srem then
        self.server.logger:log(log_level.ERROR, string.format(
            "Redis SREM failed for active_subscribers_set: %s", err_srem
        ), "PatchWSHandler", "unsubscribe")
    end

    -- 3️⃣ Remove all client-related state from FunctionalComponent instances
    if self.server and self.server.reactive_components then
        for _, comp in pairs(self.server.reactive_components) do
            if type(comp.client_states) == "table" and comp.client_states[ws_id] then
                comp.client_states[ws_id] = nil
            end
            if type(comp.clients) == "table" then
                comp.clients[ws_id] = nil
            end
            -- Also remove Redis-stored client state for this component
            if self.server.dawn_sockets_handler.state_management.redis and comp.component_key then
                self.server.logger:log(log_level.INFO,
                    string.format("Clearing Redis client state for %s:%s", comp.component_key, ws_id),
                    "PatchWSHandler", "unsubscribe"
                )
                local redis_key = string.format("client_state:%s:%s", comp.component_key, ws_id)
                local ok, err = pcall(function()
                    self.server.dawn_sockets_handler.state_management.redis:del(redis_key)
                end)
                if not ok then
                    self.server.logger:log(log_level.WARN,
                        string.format("Redis DEL failed for %s: %s", redis_key, tostring(err)),
                        "PatchWSHandler", "unsubscribe"
                    )
                end
            end
        end
    end

    self.server.logger:log(log_level.INFO,
        string.format("Client %s unsubscribed and state cleared.", ws_id),
        "PatchWSHandler", "unsubscribe"
    )
end


-- Ping function (no major changes, already efficient)
function PatchWSHandler:ping(ws, payload, state, shared, topic, presence)
    local ws_id = shared.sockets:safe_get_ws_id(ws)
    shared.sockets:push_notification(ws, {
        id = uuid.v4(),
        event = "pong",
        payload = { time = os.time() }
    })
    self.server.logger:log(log_level.DEBUG, string.format("Client %s ping -> pong", ws_id), "PatchWSHandler", "ping")
end

-- Process client action function
function PatchWSHandler:process_client_action(ws, payload, state, shared, topic, presence)
    local methodName = payload.method
    local args = payload.args or {}
    local comp_key = payload.component_key or "app_component_instance"
    local component = self.server:get_component(comp_key)
    local ws_id = shared.sockets:safe_get_ws_id(ws)

    if not component then
        shared.sockets:push_notification(ws, {
            id = uuid.v4(),
            type = "error",
            event = "action_failed",
            payload = { message = "Component not found: " .. comp_key }
        })
        self.server.logger:log(log_level.WARN, string.format("Action failed: Component not found for client %s, key: %s", ws_id, comp_key), "PatchWSHandler", "process_client_action")
        return
    end

    if type(component.patch) ~= "function" then
        shared.sockets:push_notification(ws, {
            id = uuid.v4(),
            type = "error",
            event = "action_failed",
            payload = { message = "Component 'patch' method not found for: " .. comp_key }
        })
        self.server.logger:log(log_level.WARN, string.format("Action failed: Component 'patch' method not found for client %s, key: %s", ws_id, comp_key), "PatchWSHandler", "process_client_action")
        return
    end

    component:onJoin(ws_id)
    local patches = component:patch(ws_id, methodName, args)

    if not patches or #patches == 0 then
        -- shared.sockets:push_notification(ws, {
        --     id = uuid.v4(),
        --     type = "info",
        --     event = "no_changes",
        --     payload = { message = "Action processed, but no state changes occurred." }
        -- })
        -- logger.debug("Client %s action processed, no changes for %s", ws_id, comp_key)
        return
    end

    local patch_key = "component_patch_log:" .. comp_key
    local patch_redis_commands = {} -- To pipeline LADD and LTRIM if multiple patches

    for _, patch in ipairs(patches) do
        patch.id = patch.id or uuid.v4()
        print("Pushing patch:", cjson.encode(patch))
        patch.component = self.server:get_patch_namespace(comp_key, patch.varName or patch.path)
        self.server.patch_queue:push(patch)

        local patch_entry = {
            timestamp = os.time(),
            patch = patch
        }
        local json_patch = safe_redis_encode(patch_entry)
        if json_patch then
            table.insert(patch_redis_commands, {"LPUSH", patch_key, json_patch})
            table.insert(patch_redis_commands, {"LTRIM", patch_key, 0, 99})
        else
            self.server.logger:log(log_level.ERROR, string.format("Failed to encode patch entry for component %s", comp_key), "PatchWSHandler", "process_client_action")
        end
    end

    -- Execute Redis commands for patches (LADD and LTRIM) in a pipeline
    if #patch_redis_commands > 0 then
        local ok, err = presence.redis:call_pipeline(patch_redis_commands)
        if not ok then
            self.server.logger:log(log_level.ERROR, string.format("Redis pipeline for patch log failed for %s: %s", patch_key, err), "PatchWSHandler", "process_client_action")
        end
    end

    -- State persistence logic
    if component.state then
        local state_key = "component_state:" .. comp_key
        local new_json = safe_redis_encode(component.state)
        if not new_json then
            self.server.logger:log(log_level.ERROR, string.format("Failed to encode component state for %s", comp_key), "PatchWSHandler", "process_client_action")
            return
        end

        if component._last_serialized ~= new_json then
            component._last_serialized = new_json
            component._version = 0
            presence:persist_state(state_key, component.state, 3600) -- Assuming persist_state handles encoding
            self.server.logger:log(log_level.INFO, string.format("Component state updated and persisted for %s", comp_key), "PatchWSHandler", "process_client_action")
        else
            component._version = (component._version or 0) + 1
            if component._version % 10 == 0 then
                presence:persist_state(state_key, component.state, 3600)
                self.server.logger:log(log_level.INFO, string.format("Component state persisted (version %d) for %s", component._version, comp_key), "PatchWSHandler", "process_client_action")
            end
        end
    end
end



return PatchWSHandler