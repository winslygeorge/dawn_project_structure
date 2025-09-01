require("bootstrap")("./") -- Adjust the path as needed
local DawnServer = require("dawn").dawn_server 
local server_config = require('config.server_config')
local routes = require('routes._index')

-- Create a new DawnServer instance
local server = DawnServer:new(server_config)

-- Register all routes
server.ROUTES_REGISTERED = routes

routes:load(server):registerAllRoutes()

-- Start the server
server:start()
