local Config = require(script.Parent.Parent.Config)

local Logger = {}

function Logger.Info(message)
    print("[Blox AI] INFO:", message)
end

function Logger.Warn(message)
    warn("[Blox AI] WARN:", message)
end

function Logger.Error(message)
    warn("[Blox AI] ERROR:", message)
end

function Logger.Debug(message)
    if Config.DebugMode then
        print("[Blox AI] DEBUG:", message)
    end
end

return Logger
