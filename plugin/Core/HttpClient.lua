local HttpClient = {}
local HttpService = game:GetService("HttpService")
local Config = require(script.Parent.Parent.Config)
local Logger = require(script.Parent.Parent.Utils.Logger)

local apiKey = ""

function HttpClient:SetApiKey(key)
    apiKey = key
end

function HttpClient:GetHeaders()
    return {
        ["Content-Type"] = "application/json",
        ["Authorization"] = "Bearer " .. apiKey
    }
end

function HttpClient:Get(endpoint)
    local url = Config.ApiUrl .. endpoint
    -- #region debug-point http-get-request
    Logger.Debug("HTTP GET -> " .. url .. " | auth=" .. tostring(apiKey ~= ""))
    -- #endregion
    local success, response = pcall(function()
        return HttpService:RequestAsync({
            Url = url,
            Method = "GET",
            Headers = self:GetHeaders()
        })
    end)
    
    if success and response.Success then
        -- #region debug-point http-get-success
        Logger.Debug("HTTP GET OK <- " .. endpoint .. " | status=" .. tostring(response.StatusCode) .. " | bodySize=" .. tostring(string.len(response.Body or "")))
        -- #endregion
        return true, HttpService:JSONDecode(response.Body)
    else
        Logger.Error("Erro no GET " .. endpoint .. ": HTTP " .. tostring(response and response.StatusCode or "Unknown") .. " (" .. tostring(response and response.StatusMessage or "Error") .. ")")
        -- #region debug-point http-get-failure
        if response and response.Body then
            Logger.Debug("HTTP GET BODY <- " .. endpoint .. " | snippet=" .. string.sub(response.Body, 1, 300))
        end
        -- #endregion
        return false, nil
    end
end

function HttpClient:Post(endpoint, data)
    local url = Config.ApiUrl .. endpoint
    local payload = HttpService:JSONEncode(data)
    -- #region debug-point http-post-request
    Logger.Debug("HTTP POST -> " .. url .. " | auth=" .. tostring(apiKey ~= "") .. " | payloadSize=" .. tostring(string.len(payload)))
    Logger.Debug("HTTP POST PAYLOAD -> " .. endpoint .. " | snippet=" .. string.sub(payload, 1, 350))
    -- #endregion
    
    local success, response = pcall(function()
        return HttpService:RequestAsync({
            Url = url,
            Method = "POST",
            Headers = self:GetHeaders(),
            Body = payload
        })
    end)
    
    if success and response.Success then
        -- #region debug-point http-post-success
        Logger.Debug("HTTP POST OK <- " .. endpoint .. " | status=" .. tostring(response.StatusCode) .. " | bodySize=" .. tostring(string.len(response.Body or "")))
        Logger.Debug("HTTP POST BODY OK <- " .. endpoint .. " | snippet=" .. string.sub(response.Body or "", 1, 300))
        -- #endregion
        return true, HttpService:JSONDecode(response.Body)
    else
        Logger.Error("Erro no POST " .. endpoint .. ": HTTP " .. tostring(response and response.StatusCode or "Unknown") .. " (" .. tostring(response and response.StatusMessage or "Error") .. ")")
        -- #region debug-point http-post-failure
        if response and response.Body then
            Logger.Debug("HTTP POST BODY <- " .. endpoint .. " | snippet=" .. string.sub(response.Body, 1, 300))
        end
        -- #endregion
        return false, nil
    end
end

return HttpClient
