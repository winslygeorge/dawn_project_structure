local json = require('dkjson')
local jwt = require("auth.purejwt")
local store = require("auth.token_store")
local jwtMilddleware = require('auth.jwt_protect')
local refresh_handler = require("routes.middlewares.refresh_handler")

local env_var = require('config.get_env')

 local jwt_config = env_var and env_var.JWT_CONFIG  or {}
 local store_config = env_var and env_var.STORE_CONFIG  or {}

local M = {}
M.__index = M

function M:new(server)
  local self = setmetatable({}, M)
  self.server = server
  return self
end

function M:routes()

  -- ✅ Extract and validate critical JWT options early
  local jwt_secret = jwt_config.secret or nil
  assert(jwt_secret and jwt_secret ~= "", "JWT secret must be provided")

  store.init(store_config)

  local jwt_options = {
    secret = jwt_secret,
    issuer = jwt_config.issuer or nil,       -- can be nil
    audience = jwt_config['audience'] or  nil,   -- can be nil
    verify_exp = true,
    verify_iss = true,
    verify_aud = true,
    custom_claims = { role = "admin" }
  }

  -- ✅ Apply JWT middleware after CORS to ensure headers are accessible
  self.server:use(jwtMilddleware(jwt_options), "/api")

  -- ✅ /auth/login endpoint (excluded from JWT protection)
  self.server:post("/auth/login", function(req, res)
    local body = req.body or {}
    if type(body) == "string" then
      local ok, parsed = pcall(json.decode, body)
      if ok then body = parsed else body = {} end
    end

    local username = body.username
    local password = body.password

    if username ~= "admin" or password ~= "secret" then
      return res:writeStatus(401):send(json.encode({ error = "Invalid credentials" }))
    end

    local now = os.time()
    local user_id = username

   

    -- ✅ Use the exact same `secret`, `issuer`, and `audience` as configured
    local access_token = jwt.encode({
      sub = user_id,
      role = "admin",
      type = "access",
      iat = now,
      exp = now + (jwt_config.access_token_expiration or 1800),
      iss = jwt_config['issuer'] or nil,
      aud = jwt_config['audience'] or nil
    }, jwt_secret)

    local refresh_token = jwt.encode({
      sub = user_id,
      type = "refresh",
      iat = now,
      exp = now + (jwt_config.refresh_token_expiration or 1800),
    }, jwt_secret)

    -- ✅ Save refresh token with extra context metadata
    local metadata = {
      device_id = req._raw:getHeader("x-device-id") or "unknown",
      ip = req._raw:getHeader("x-real-ip") or req:getHeader("x-forwarded-for") or "unknown",
      agent = req._raw:getHeader("user-agent") or "unknown"
    }


    store.save_refresh_token(user_id, refresh_token, metadata)

    res:writeHeader("Content-Type", "application/json")
    res:send(json.encode({
      access_token = access_token,
      refresh_token = refresh_token
    }))
  end)


    self.server:post("/auth/refresh", refresh_handler(jwt_options))

end

return M
