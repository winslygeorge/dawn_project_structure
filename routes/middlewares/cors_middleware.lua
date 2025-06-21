return function(options)
    options = options or {}
    local allow_origin = options.allow_origin or "*"
    local allow_methods = options.allow_methods or "GET, POST, PUT, DELETE, OPTIONS"
    local allow_headers = options.allow_headers or "Content-Type, Authorization"

    return function(req, res, next)

        if(req == nil and res == '' and next == '') then next() end;
       
        res:writeHeader("Access-Control-Allow-Origin", allow_origin)
        res:writeHeader("Access-Control-Allow-Methods", allow_methods)
        res:writeHeader("Access-Control-Allow-Headers", allow_headers)
        res:writeHeader("Access-Control-Allow-Credentials", "true")

        -- Handle preflight OPTIONS request
        if req.method == "OPTIONS" then
            return res:writeStatus(204):send("")
        end

        next()
    end
end
