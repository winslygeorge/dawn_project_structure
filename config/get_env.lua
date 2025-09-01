local json = require("dkjson")
local env = require("env")

local mode = os.getenv("MODE") or "dev"
local config = env.load(mode == "prod" and "prod.env" or "dev.env", {
  defaults = { TIMEOUT = 60 },
  export = false
})

config.DEBUG = mode == "dev"

return config