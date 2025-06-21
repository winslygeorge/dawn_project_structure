-- Initialize a logger
local  store = require('dawn').token_store

local log_level = require('utils.logger').LogLevel

local env = require('config.get_env')

local multiparser_opts_configurations = {
  max_memory_size = 1024 * 512, -- ⬅️ Max allowed memory per part (512 KB); raises error if exceeded (only applies if stream_to_disk = false)

  decode_base64 = false,        -- ⬅️ If true, decodes base64-encoded parts (when Content-Transfer-Encoding is base64)

  decode_gzip = true,           -- ⬅️ If true, automatically decompresses parts with Content-Type: application/gzip

  stream_to_disk = true,        -- ⬅️ If true, writes file parts directly to disk instead of keeping them in memory

  auto_save_dir = "./uploads",  -- ⬅️ Directory to save uploaded file parts when stream_to_disk is enabled

  on_start_part = function(part)
    print("Started part:", part.name)
  end,                          -- ⬅️ Optional callback called at the start of each part (e.g., before body content is parsed)

  on_end_part = function(part)
    print("Finished part:", part.name, part.size, part.path)
  end,                          -- ⬅️ Optional callback called after a part is fully processed (headers + body)

  progress_callback = function(bytes)
    print("Uploaded bytes:", bytes)
  end,                          -- ⬅️ Optional function that receives total bytes read so far (for progress bars or logging)

  -- encryption_key = "mysecretkey", -- ⬅️ (Optional) If used, you could enable decryption logic for encrypted file uploads

  -- cleanup = true, -- ⬅️ Reserved: if implemented, would remove temp files after parsing (currently unused)

  -- nested = true -- ⬅️ (Used in `accumulate`) Enables parsing of nested field names like "user[name]" into form.user.name
}

local store_config = {
    store = store, -- uncomment if you want to store persistence to use json file 
    cleanup_interval = 3600,     -- ⬅️ Interval in seconds to trigger periodic cleanup (can be used by a scheduler or loop elsewhere in app).
}

-- Define server configuration
local server_config = {
    port = env and env.PORT or 8080,
    level = env and env.DEBUG == true and log_level.DEBUG or log_level.WARN, -- Set log level based on environment variable or default to 'info'
    logger = nil,
    -- Configure static file serving
    -- Each entry is a table with 'route_prefix' and 'directory_path'
    static_configs = {
        { route_prefix = "/static", directory_path = "./public" },
        -- You can add more static directories if needed:
        -- { route_prefix = "/assets", directory_path = "./assets" },
    },

    multipart_parser_options = multiparser_opts_configurations,

    token_store = store_config,

    state_management_options = {
      handlers = require('websockets.handlers._index') or {},
        state_management_options = env and env.REDIS_CONFIG and env.REDIS_CONFIG or {session_timeout = 3600, -- Session timeout in seconds
        cleanup_interval = 60  }, -- How often to clean up expired sessions
         state = {
        state_management = require('websockets.state_management._index')
    }
    },
}

return server_config