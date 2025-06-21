-- auth/refresh_handler.lua

local jwt = require("auth.purejwt")
local store = require("auth.token_store")
local cjson = require("dkjson")
local env_var = require('config.get_env')
local store_config = env_var and env_var.STORE_CONFIG or {}
return function(options)
    assert(options and options.secret, "Refresh handler requires a 'secret'")

    -- Extract JWT verification options from the passed options
    -- Default to true if not explicitly set, to match encoding settings from routes.lua
    local issuer = options.issuer or nil
    local audience = options.audience or nil

    store.init(store_config)

    return function(req, res)
        
        local auth = req._raw:getHeader("authorization") or ""
        local token = auth:match("Bearer%s+(.+)")
        if not token then
            return res:writeStatus(401):send(cjson.encode({ error = "Missing refresh token" }))
        end

        local decoded, err = jwt.decode(token, options.secret, {
            verify_exp = true,
        })

        if not decoded then
            print("Refresh token decode failed: " , (require("dkjson").encode(err) or "unknown error"))
            return res:writeStatus(401):send(cjson.encode({ error = "Invalid refresh token" }))
        end

        if decoded.type ~= "refresh" then
            return res:writeStatus(401):send(cjson.encode({ error = "Invalid token type" }))
        end

        local user_id = decoded.sub
        
        if not store.verify(user_id, token) then
            return res:writeStatus(401):send(cjson.encode({ error = "Refresh token has been revoked" }))
        end

        -- Issue new tokens
        local now = os.time()
        local access_token = jwt.encode({
            sub = user_id,
            role = decoded.role,
            type = "access",
            iat = now,
            exp = now + (options.access_exp or 60),
            iss = issuer,   -- Re-include issuer
            aud = audience  -- Re-include audience
        }, options.secret)

        local refresh_token = jwt.encode({
            sub = user_id,
            type = "refresh",
            iat = now,
            exp = now + (options.refresh_exp or 86400),
        }, options.secret)

        -- Note: store.save_refresh_token(user_id, refresh_token)
        -- If you need to store metadata, you might need to adjust this function call
        -- based on how `store.save_refresh_token` is implemented in `auth.token_store`.
        -- For now, it matches the original snippet.
                local metadata = {
            device_id = req._raw:getHeader("x-device-id") or "unknown",
            ip = req._raw:getHeader("x-real-ip") or req:getHeader("x-forwarded-for") or "unknown",
            agent = req._raw:getHeader("user-agent") or "unknown"
            }
        store.save_refresh_token(user_id, refresh_token, metadata)

        res:writeHeader("Content-Type", "application/json")
        res:send(cjson.encode({
            access_token = access_token,
            refresh_token = refresh_token
        }))
    end
end