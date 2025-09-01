
local myCounter = require('lib.counter_component')
local layout_model = require('dawn').layout_model
local AppController = require("controllers.App")
local democounter = require('lib.backend_reactive_fpage')
local MainLayout = require("lib.main_layout")
local Button = require("lib.button")

local M = {}
M.__index = M

function M:new(server)
  local self = setmetatable({}, M)
  self.server = server
  return self
end

function M:routes()

  -- Your routes go here, e.g.:
    self.server:get("/home", function(req, res, query)

      MainLayout:init(function (children, props, style)
        children.body = Button:render_layout()
      end)

      local htmlOutput = MainLayout:render_layout()

      res:send(htmlOutput)

    end)
    
    -- HTTP Route for the main page
    self.server:get("/counter", function(req, res, query)
        -- Render the full page using HTMLReactive.App
        local s = self.server
        myCounter:setServer(s)
        myCounter:setComponentKey("counterApp") -- 🔄 Key must be set BEFORE init()
        -- myCounter:init(function (server, children, props, style, HTMLReactive_lib, collected_js_scripts)
        --   myCounter:setServer(s)
        -- end)

        local html_output = myCounter:render_layout()
        -- Send the rendered HTML as a response
        res:writeHeader("Content-Type", "text/html")
        res:writeHeader("Cache-Control", "no-cache, no-store, must-revalidate")
        res:writeHeader("Pragma", "no-cache")
        res:writeStatus(200)    
        print("CounterComponent rendered successfully!")
        res:send(html_output)
        print("Last CounterComponent rendered successfully!")

    end)

    self.server:get('/todo', function(req, res, query)

      local todo_component = require('lib.backend_reactive_fpage')

       local s = self.server
        todo_component:setServer(s)
        local html_output = todo_component:render_layout()
        -- Send the rendered HTML as a response
        res:writeHeader("Content-Type", "text/html")
        res:writeHeader("Cache-Control", "no-cache, no-store, must-revalidate")
        res:writeHeader("Pragma", "no-cache")
        res:writeStatus(200)    
        res:send(html_output)
    end)

    self.server:get('/login', function(req, res, query)

      local login_form = require('lib.login_form')

       local s = self.server
        login_form:setServer(s)
        local html_output = login_form:render_layout()
        -- Send the rendered HTML as a response
        res:writeHeader("Content-Type", "text/html")
        res:writeHeader("Cache-Control", "no-cache, no-store, must-revalidate")
        res:writeHeader("Pragma", "no-cache")
        res:writeStatus(200)    
        res:send(html_output)
    end)

end

return M


