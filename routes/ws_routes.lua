local json = require('dkjson')

-- this module is still not added to the main routes index
-- it is a placeholder for WebSocket routes
local M = {}
M.__index = M

function M:new(server)
  local self = setmetatable({}, M)
  self.server = server
  return self
end

function M:routes()
  -- Your routes go here, e.g.:
  self.server:ws("/ws", function(req, res)
  end)
end

return M