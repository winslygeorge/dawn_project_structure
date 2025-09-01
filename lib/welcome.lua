-- WelcomePage.lua
-- Full reactive component with methods, live validation, styled UI, and footer attribution

local FunctionalComponent = require("layout.renderer.FuncComponent")
local HTML = require("layout.renderer.LuaHTMLReactive")
local cjson = require("cjson")

local WelcomePage = FunctionalComponent:extends()
WelcomePage:setReactiveView()

function WelcomePage:renderLayout(state, props, children, H)

  return HTML.e("div", { class = "flex flex-col min-h-screen bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-gray-900" }, {
        -- Main container
        HTML.e("div", { class = "flex-grow flex items-center justify-center p-6" }, {
          HTML.e("div", { class = "bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center space-y-6 transition duration-300 ease-in-out" }, {
            HTML.e("h1", { class = "text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-500" }, "✨ Demo Counter"),
            HTML.e("div", { class = "text-4xl font-semibold" }, {
              HTML.e("span", { class = "text-gray-600 mr-2" }, "Count:"),
              HTML.e("span", { class = "text-indigo-600 transition-colors", ['data-bind'] = "count", id = "count" }, tostring(state.count))
            }),
            HTML.e("p", { id = "errorMsg", class = "text-red-500 text-sm font-medium mt-2 hidden" }, "⚠️ Value can't be negative"),
            HTML.e("div", { class = "flex justify-between gap-4 mt-6" }, {
              HTML.Button('➕ Add', HTML.merge(
                { class = "flex-1 py-3 rounded-xl bg-green-500 text-white font-bold shadow hover:bg-green-600 active:scale-95 transition duration-300 ease-in-out" },
                HTML.onClick(
                  HTML.client.batch(
                    HTML.client.if_(
                      { operator = ">=", left = HTML.client.convert(HTML.client.getText("#count"), 'number'), right = 0, _complexCondition = true },
                      HTML.client.batch(
                        HTML.patch('welcomePage', nil, 'addCount'),
                        HTML.client.hide("#errorMsg")
                      ),
                      HTML.client.show("#errorMsg")
                    )
                  )
                )
              )),
              HTML.Button('➖ Subtract', HTML.merge(
                { class = "flex-1 py-3 rounded-xl bg-red-500 text-white font-bold shadow hover:bg-red-600 active:scale-95 transition duration-300 ease-in-out" },
                HTML.onClick(
                  HTML.client.batch(
                    HTML.client.if_(
                      { operator = ">", left = HTML.client.convert(HTML.client.getText("#count"), 'number'), right = 0, _complexCondition = true },
                      HTML.patch('welcomePage', nil, 'subtractCount'),
                      HTML.client.show("#errorMsg")
                    )
                  )
                )
              )),
              HTML.Button('🔄 Reset', HTML.merge(
                { class = "flex-1 py-3 rounded-xl bg-purple-500 text-white font-bold shadow hover:bg-purple-600 active:scale-95 transition duration-300 ease-in-out" },
                HTML.onClick(
                  HTML.client.batch(
                    HTML.patch('welcomePage', nil, 'resetCount'),
                    HTML.client.hide("#errorMsg")
                  )
                )
              ))
            })
          })
        }),
        HTML.e("footer", { class = "text-center py-4 bg-black/20 text-white text-sm" }, {
          HTML.e("p", {}, "Designed with ❤️ by Your Name - 2025")
        })
      })
end

local function startInit()
  WelcomePage:init(function(server, children, props, style, HTMLReactive, collected_js_scripts)
    --====== METHODS ======
    WelcomePage.methods.addCount = function(self, ws_id, args)
      self:setState({ count = self.state.count + 1 })
    end

    WelcomePage.methods.subtractCount = function(self, ws_id, args)
      self:setState({ count = self.state.count - 1 })
    end

    WelcomePage.methods.resetCount = function(self, ws_id, args)
      self:setState({ count = 0 })
    end

    return function(state, props, children, H)
      return WelcomePage:renderLayout(state, props, children, H)
    end
  end)
end

function WelcomePage:render_layout()
  self:setComponentKey('welcomePage')
  self:loadStateFromRedis()
  startInit()
  self:setState({ count = 10 })
  local final_html_vdom = self:renderAppPage({
    title = "Count Component",
    state = self.state,
    head_extra = HTML.e("script", {}, string.format(
      "window.__DEFAULT_COMPONENT_KEY__ = %q;", self.component_key or ""
    )),
    body_attrs = { class = "antialiased bg-[#FFFFFF]" }
  })
  return self.HTMLReactive.render(final_html_vdom)
end

return WelcomePage