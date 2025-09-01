local env = require("config.get_env")
local rate_limit_store = {}

-- Default config per category (env overrides if set)
local rate_limits = {
    auth = {
        window = tonumber(env.RATE_LIMIT_AUTH_WINDOW_SECS) or 60,
        max_requests = tonumber(env.RATE_LIMIT_AUTH_MAX_REQ) or 5,
        burst = tonumber(env.RATE_LIMIT_AUTH_BURST) or 2
    },
    api = {
        window = tonumber(env.RATE_LIMIT_API_WINDOW_SECS) or 60,
        max_requests = tonumber(env.RATE_LIMIT_API_MAX_REQ) or 100,
        burst = tonumber(env.RATE_LIMIT_API_BURST) or 20
    },
    sse = {
        window = tonumber(env.RATE_LIMIT_SSE_WINDOW_SECS) or 60,
        max_requests = tonumber(env.RATE_LIMIT_SSE_MAX_REQ) or 300,
        burst = tonumber(env.RATE_LIMIT_SSE_BURST) or 50
    },
    page = {
        window = tonumber(env.RATE_LIMIT_PAGE_WINDOW_SECS) or 60,
        max_requests = tonumber(env.RATE_LIMIT_PAGE_MAX_REQ) or 600,
        burst = tonumber(env.RATE_LIMIT_PAGE_BURST) or 100
    }
}

-- IP whitelist (no rate limiting)
local whitelist_ips = {
    ["127.0.0.1"] = true,
    ["::1"] = true,
    [env.RATE_LIMIT_TRUSTED_IP or ""] = true
}

-- Utility: extract query params into table
local function parse_query(qs)
    local params = {}
    for key, val in string.gmatch(qs or "", "([^&=?]+)=([^&=?]+)") do
        params[key] = val
    end
    return params
end

return function()
    return function(req, res, next)
        -- Skip OPTIONS (CORS preflight)
        if req.method == "OPTIONS" then
            return next()
        end

          -- Identify client identifier (prefer user_id for WS if present)
        local identifier
        if req.method == "WS" then
            -- First try query string param `user_id`
            local qs = req.url:match("%?(.*)$")
            local params = parse_query(qs)
            if params["user_id"] then
                identifier = "user:" .. params["user_id"]
            end

            -- Fallback to x-forwarded-for
            if not identifier then
                identifier = req.headers and req.headers["x-forwarded-for"]
            end
        else
            identifier = req._raw and req._raw:getHeader("x-forwarded-for")
        end

        
        -- Determine category from URL
        local category = "page" -- Default category

        if req.method ~= "WS" then

        if req.url and req.url:match("^/auth")  then
            category = "auth"
        elseif req.url and req.url:match("^/api")  then
            category = "api"
        elseif req.url and req.url:match("^/sse")  then
            category = "sse"
        else
            category = "page"
        end

    end

      
        if identifier and identifier ~= "" then
            identifier = identifier:match("([^,]+)") or identifier
        else
            identifier = res and res.getRemoteAddress and res:getRemoteAddress() or "unknown_" .. tostring(req)
        end

        -- Whitelist check (only applies if it's IP-based)
        if whitelist_ips[identifier] then
            return next()
        end

        -- Get category-specific config
        local limit_cfg = rate_limits[category]
        local window = limit_cfg.window
        local max_requests = limit_cfg.max_requests
        local burst = limit_cfg.burst

        -- Token bucket with burst capacity
        local key = identifier .. ":" .. category
        local now = os.time()

        local record = rate_limit_store[key]
        if not record then
            record = { tokens = max_requests + burst, last = now }
        else
            -- Refill tokens gradually
            local elapsed = now - record.last
            local refill = (elapsed / window) * max_requests
            record.tokens = math.min(max_requests + burst, record.tokens + refill)
            record.last = now
        end

        if record.tokens >= 1 then
            record.tokens = record.tokens - 1
            rate_limit_store[key] = record
            return next()
        else
            -- Calculate Retry-After in seconds
            local retry_after = math.ceil(window - (now - record.last))
            res:writeHeader("Retry-After", retry_after)
            res:writeStatus(429)
               :send("Too Many Requests - " .. category .. " limit exceeded. Retry after " .. retry_after .. "s.")
        end
    end
end
