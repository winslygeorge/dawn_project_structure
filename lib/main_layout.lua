local FuncComponent = require('layout.renderer.FuncComponent')

-- local navComponent = require("lib.nav_comp")

local  MainComponent = FuncComponent:extends()

-- MainComponent:setTheme("light")

MainComponent:setView('layouts/default')

function MainComponent:startInit()

    self:init(function (children, props, style)
      props.layout_data = {
        title = "Home - Dawnserver",
        head_extra = '<meta name="keywords" content="luajit, webserver, uwebsockets">',
        -- body_extra = '<script src="/static/js/home-page-specific.js" defer></script>',
        current_year = os.date("%Y")
    }
    -- you can add children layouts to the main layout by using below illustration
    -- children.nav = navComponent:build()
    end)

end

function MainComponent:render_layout()
    self:startInit()
    local output = self:build()
    return output
end

return MainComponent

