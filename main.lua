
package.path = package.path .. ";./?.lua;./../?.lua;"
require("bootstrap")("../") -- Adjust the path as needed
local DawnServer = require("dawn").dawn_server 
local Logger = require("utils.logger").Logger 
local server_config = require('config.server_config')
local routes = require('routes._index')
local env = require("config.get_env")
local json = require("dkjson")
local uv = require("luv") -- Assuming you're using luv for event loop and timers

-- Create a new DawnServer instance
local server = DawnServer:new(server_config)

-- Register all routes
routes:load(server):registerAllRoutes()

server:get("/home", function(req, res)
    res:send("Welcome to the Dawn Server!")
end)

server:get("/health", function(req, res)
    res:send("Server is running")
end)

local active_sse_clients = {} -- Table to keep track of active SSE clients

-- server:get("/sse/events", function(req, res)

--     res:send("text/event-stream")

-- end)

-- Add this to your main server setup, for example in a file like `main.lua`
-- assuming 'DawnServer' is already required and initialized as 'server'

-- SSE Route Example
server:get("/sse/events", function(req, res, query_params)
    local sse_id = req.sse_id
    active_sse_clients[sse_id] = true -- Track active SSE clients
    server.logger:log(2, "New SSE connection opened with ID: " .. sse_id, "SSE_Server")

    -- Send an initial message
    server:sse_send(sse_id, "Welcome to the SSE stream!", "message")

    -- Example: Send a message every 5 seconds
    local counter = 0
    local timer = uv.new_timer()
    uv.timer_start(timer, 0, 5000, function()
        counter = counter + 1
        local data = {
            id = counter,
            timestamp = os.time(),
            message = "Server message " .. counter
        }
        local json_data = json.encode(data)
        server:sse_send(sse_id, json_data, "update") -- 'update' is the event type

        -- Optionally close the connection after a certain number of messages
        if counter >= 10 then
            -- server.logger:log(log_level.INFO, "Closing SSE connection for ID: " .. sse_id .. " after 10 messages", "SSE_Server")
            server:sse_close(sse_id)
            uv.timer_stop(timer)
            uv.close(timer)
        end
    end)

    -- Handle SSE connection close (this part is implicitly handled by uWS,
    -- but you might want to log it or clean up resources if needed)
    -- Note: uWS will automatically remove the sse_id when the client disconnects.
    -- The timer will eventually stop or try to send to a closed connection, which uWS handles gracefully.
end)

-- You would typically start your server after defining routes:
-- server:start()

-- write a get broadcast route for post to sse
server:get("/broadcast", function(req, res, query_params)
    local message = query_params.message or "No message provided"
    server.logger:log(2, "Broadcasting message: " .. message, "SSE_Server")

    -- Broadcast to all active SSE clients
    for sse_id in pairs(active_sse_clients) do
        local success, err = server:sse_send(sse_id, message, "broadcast")
        if not success then
            server.logger:log(3, "Failed to send message to SSE client " .. sse_id .. ": " .. err, "SSE_Server")
            active_sse_clients[sse_id] = nil -- Remove inactive client
        end
    end

    res:send("Message broadcasted to all SSE clients.")
end)

-- Start the server
server:start()

-- Keep the Lua event loop running (if using luv directly, otherwise uWS.run() handles it)
uv.run()