local json_ok, json = pcall(require, "dkjson")
if not json_ok then error("dkjson required for env.lua to parse JSON") end

local M = { _cache = nil }

local function trim(s)
  if type(s) ~= "string" then s = tostring(s) end
  return s:match("^%s*(.-)%s*$")
end

local function cast_value(val)
  if type(val) ~= "string" then return val end
  val = trim(val)

  if val == "true" then return true end
  if val == "false" then return false end
  local num = tonumber(val)
  if num then return num end

  if val:match("^%{") or val:match("^%[") then
    local ok, parsed = pcall(json.decode, val)
    if ok and parsed then return parsed end
  end

  return val:gsub('^"(.*)"$', "%1"):gsub("^'(.*)'$", "%1")
end

function M.load(filename, opts)
  if M._cache then return M._cache end

  opts = opts or {}
  local required = opts.required or {}
  local defaults = opts.defaults or {}
  local export = opts.export ~= false

  local env = {}
  for k, v in pairs(defaults) do
    env[k] = cast_value(v)
  end

  local f = assert(io.open(filename, "r"), "Cannot open " .. filename)
  local content = f:read("*a")
  f:close()

  local current_key = nil
  local current_val_lines = {}
  for line in content:gmatch("[^\r\n]+") do
    local key, value = line:match("^%s*([%w_]+)%s*=%s*(.+)%s*$")

    if key and value then
      if value:match("^%{") or value:match("^%[") then
        -- Begin multi-line JSON
        current_key = key
        current_val_lines = { value }
      else
        env[key] = cast_value(value)
      end
    elseif current_key then
      -- Continue collecting multi-line JSON
      table.insert(current_val_lines, line)

      local joined = table.concat(current_val_lines, "\n")
      local ok, parsed = pcall(json.decode, joined)
      if ok and parsed then
        env[current_key] = parsed
        current_key = nil
        current_val_lines = {}
      end
    end
  end

  for _, k in ipairs(required) do
    if env[k] == nil then
      error("Missing required env variable: " .. k)
    end
  end

  M._cache = env
  return env
end

function M.reset()
  M._cache = nil
end

return M
