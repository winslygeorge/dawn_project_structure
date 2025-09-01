local MainLayout = require("lib.main_layout")

local M = {}
M.__index = M

function M:new(server)
  local self = setmetatable({}, M)
  self.server = server
  return self
end

function M:routes()

  -- Your routes go here, e.g.:
    self.server:get("/welcome", function(req, res, query)

      local welcomePage = require("lib.welcome")

      welcomePage:setServer(self.server)
      local htmlOutput = welcomePage:render_layout()

      res:send(htmlOutput)

    end)
    
end

return M


