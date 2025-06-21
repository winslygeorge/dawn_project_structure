local FuncComponent = require('layout.renderer.FuncComponent')

-- local navComponent = require("lib.nav_comp")

local  MainComponent = FuncComponent:extends()

-- MainComponent:setTheme("light")

MainComponent:setView('layouts/default')

MainComponent:init(function (children, props, style)
      props.layout_data = {
        title = "Home - Dawnserver",
        head_extra = '<meta name="keywords" content="luajit, webserver, uwebsockets">',
        body_extra = '<script src="/static/js/home-page-specific.js" defer></script>',
        current_year = os.date("%Y")
    }

    -- you can add children layouts to th emain layout by using below ilustration
    -- children.nav = navComponent:build()
    
end)

function MainComponent:render_layout(controller)
    local output = self:build()
    controller:render(output)
end

return MainComponent


