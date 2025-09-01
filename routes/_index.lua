local M = {}
M.__index = M

-- Route modules
M.auth = require('routes.auth_routes')
M.system = require('routes._system_routes')
M.app = require('routes.app_routes')
M.ws = require('routes.ws_routes')

-- Initializes the routes with the server instance
function M:load(server)
    local instance = setmetatable({}, M)
    for name, route in pairs(M) do
        if type(route) == "table" and route.new then
            instance[name] = route:new(server)
        end
    end
    return instance
end

-- Registers all initialized routes
function M:registerAllRoutes()
    for name, route in pairs(self) do
        if type(route) == "table" and route.routes then
            assert(route.server, "Route '" .. name .. "' is not initialized with a server instance")
            route:routes()
        end
    end
end

return M
-- This module serves as a central index for all route modules in the application.
-- It dynamically loads and initializes each route module, allowing for easy management and registration of routes.