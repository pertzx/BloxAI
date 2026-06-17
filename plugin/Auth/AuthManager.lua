local AuthManager = {}
local HttpService = game:GetService("HttpService")
local MarketplaceService = game:GetService("MarketplaceService")
local Logger = require(script.Parent.Parent.Utils.Logger)
local Config = require(script.Parent.Parent.Config)
local HttpClient = require(script.Parent.Parent.Core.HttpClient)

-- Armazenamento via plugin:SetSetting — persiste entre sessões do Studio,
-- é isolado a ESTE plugin (outros plugins não conseguem ler) e NÃO vai no
-- arquivo do place (publicar/compartilhar o jogo não vaza a credencial).
local ACCOUNT_KEY_KEY = "BloxAI_AccountKey"
local PROJECT_ID_KEY = "BloxAI_ProjectId"

-- Eventos customizados para atualizar a UI
local BindableEvent = Instance.new("BindableEvent")
AuthManager.OnAuthChanged = BindableEvent.Event

function AuthManager:Initialize(pluginInstance)
    self.Plugin = pluginInstance
    Logger.Info("AuthManager Inicializado.")

    -- Tenta auto-login com a chave salva localmente (primeiro login é manual)
    task.spawn(function()
        self:TryAutoLogin()
    end)
end

-- Detecta o placeId atual e o nome REAL do jogo (se publicado).
function AuthManager:GetGameInfo()
    local placeId = game.PlaceId
    local placeName = game.Name

    if placeId and placeId ~= 0 then
        local ok, info = pcall(function()
            return MarketplaceService:GetProductInfo(placeId)
        end)
        if ok and info and info.Name then
            placeName = info.Name
        end
    end

    return tostring(placeId), placeName
end

function AuthManager:SavePluginKey(pluginKey, projectId)
    if not self.Plugin then return end
    self.Plugin:SetSetting(ACCOUNT_KEY_KEY, pluginKey)
    if projectId then
        self.Plugin:SetSetting(PROJECT_ID_KEY, tostring(projectId))
    end
end

function AuthManager:GetPluginKey()
    if not self.Plugin then return nil end
    local key = self.Plugin:GetSetting(ACCOUNT_KEY_KEY)
    if type(key) == "string" and key ~= "" then
        return key
    end
    return nil
end

function AuthManager:GetProjectId()
    if not self.Plugin then return nil end
    local id = self.Plugin:GetSetting(PROJECT_ID_KEY)
    if type(id) == "string" and id ~= "" then
        return id
    end
    return nil
end

-- Conecta via CHAVE DE CONTA. O projeto é criado/conectado automaticamente
-- pelo Place ID detectado — não é preciso criar projeto antes.
function AuthManager:Login(pluginKey)
    pluginKey = pluginKey and tostring(pluginKey):gsub("%s+", "") or ""
    if pluginKey == "" then
        return false, "Cole a chave da conta (dashboard web)."
    end

    local placeId, placeName = self:GetGameInfo()
    if placeId == "0" then
        return false, "Publique o jogo primeiro (Place ID inválido)."
    end

    local url = Config.ApiUrl .. "/plugin/connect"
    local payload = HttpService:JSONEncode({
        pluginKey = pluginKey,
        placeId = placeId,
        placeName = placeName,
    })

    Logger.Debug("Plugin connect | placeId=" .. placeId .. " | placeName=" .. placeName)

    local success, response = pcall(function()
        return HttpService:PostAsync(url, payload, Enum.HttpContentType.ApplicationJson, false)
    end)

    if success then
        local ok, data = pcall(function() return HttpService:JSONDecode(response) end)
        if ok and data and data.token and data.project then
            self:SavePluginKey(pluginKey, data.project.id)
            HttpClient:SetApiKey(data.token) -- JWT para as chamadas autenticadas
            local verb = data.created and "Projeto criado: " or "Conectado a "
            Logger.Info(verb .. data.project.name)
            BindableEvent:Fire(true, data.project.name)
            return true, verb .. data.project.name
        else
            local err = (ok and data and data.error) or "Resposta inválida do servidor."
            return false, err
        end
    else
        Logger.Error("Erro ao conectar: " .. tostring(response))
        return false, "Erro de conexão com o servidor."
    end
end

function AuthManager:TryAutoLogin()
    local pluginKey = self:GetPluginKey()
    if pluginKey then
        Logger.Info("Tentando auto-login com a chave salva...")
        local success, msg = self:Login(pluginKey)
        if not success then
            Logger.Warn("Auto-login falhou: " .. tostring(msg))
            BindableEvent:Fire(false, nil, msg)
        end
    else
        BindableEvent:Fire(false)
    end
end

function AuthManager:Logout()
    if self.Plugin then
        self.Plugin:SetSetting(ACCOUNT_KEY_KEY, nil)
        self.Plugin:SetSetting(PROJECT_ID_KEY, nil)
    end
    HttpClient:SetApiKey("")
    Logger.Info("Logout efetuado.")
    BindableEvent:Fire(false)
end

function AuthManager:IsAuthenticated()
    return self:GetPluginKey() ~= nil
end

return AuthManager
