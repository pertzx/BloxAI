local AuthManager = {}
local ServerStorage = game:GetService("ServerStorage")
local HttpService = game:GetService("HttpService")
local MarketplaceService = game:GetService("MarketplaceService")
local Logger = require(script.Parent.Parent.Utils.Logger)
local Config = require(script.Parent.Parent.Config)
local HttpClient = require(script.Parent.Parent.Core.HttpClient)

local STORAGE_FOLDER_NAME = "BloxAI_Internal_Data"
local API_KEY_KEY = "ProjectApiKey"
local PROJECT_ID_KEY = "CurrentProjectId"

-- Eventos customizados para atualizar a UI
local BindableEvent = Instance.new("BindableEvent")
AuthManager.OnAuthChanged = BindableEvent.Event

function AuthManager:Initialize(pluginInstance)
    self.Plugin = pluginInstance
    Logger.Info("AuthManager Inicializado.")

    self:EnsureStorageExists()

    -- Tenta auto-login ao iniciar o plugin (usando a apiKey salva)
    task.spawn(function()
        self:TryAutoLogin()
    end)
end

function AuthManager:EnsureStorageExists()
    local folder = ServerStorage:FindFirstChild(STORAGE_FOLDER_NAME)
    if not folder then
        folder = Instance.new("Folder")
        folder.Name = STORAGE_FOLDER_NAME
        folder.Parent = ServerStorage
        folder.Archivable = false
    end
    return folder
end

-- Detecta o placeId atual e o nome REAL do jogo (se publicado).
function AuthManager:GetGameInfo()
    local placeId = game.PlaceId
    local placeName = game.Name

    if placeId and placeId ~= 0 then
        -- Tenta pegar o nome real do jogo publicado
        local ok, info = pcall(function()
            return MarketplaceService:GetProductInfo(placeId)
        end)
        if ok and info and info.Name then
            placeName = info.Name
        end
    end

    return tostring(placeId), placeName
end

function AuthManager:SaveApiKey(apiKey, projectId)
    local folder = self:EnsureStorageExists()

    local keyVal = folder:FindFirstChild(API_KEY_KEY)
    if not keyVal then
        keyVal = Instance.new("StringValue")
        keyVal.Name = API_KEY_KEY
        keyVal.Parent = folder
    end
    keyVal.Value = apiKey
    HttpClient:SetApiKey(apiKey)

    if projectId then
        local pIdVal = folder:FindFirstChild(PROJECT_ID_KEY)
        if not pIdVal then
            pIdVal = Instance.new("StringValue")
            pIdVal.Name = PROJECT_ID_KEY
            pIdVal.Parent = folder
        end
        pIdVal.Value = tostring(projectId)
    end
end

function AuthManager:GetApiKey()
    local folder = ServerStorage:FindFirstChild(STORAGE_FOLDER_NAME)
    if folder then
        local keyVal = folder:FindFirstChild(API_KEY_KEY)
        if keyVal and keyVal.Value ~= "" then
            return keyVal.Value
        end
    end
    return nil
end

function AuthManager:GetProjectId()
    local folder = ServerStorage:FindFirstChild(STORAGE_FOLDER_NAME)
    if folder then
        local pIdVal = folder:FindFirstChild(PROJECT_ID_KEY)
        if pIdVal and pIdVal.Value ~= "" then
            return pIdVal.Value
        end
    end
    return nil
end

-- Login via apiKey do projeto (copiada do dashboard web).
-- placeId e nome do jogo são detectados automaticamente.
function AuthManager:Login(apiKey)
    apiKey = apiKey and tostring(apiKey):gsub("%s+", "") or ""
    if apiKey == "" then
        return false, "Cole a API Key do projeto."
    end

    local placeId, placeName = self:GetGameInfo()
    if placeId == "0" then
        return false, "Publique o jogo primeiro (Place ID inválido)."
    end

    local url = Config.ApiUrl .. "/plugin/auth"
    local payload = HttpService:JSONEncode({
        apiKey = apiKey,
        placeId = placeId,
        placeName = placeName,
    })

    Logger.Debug("Plugin login | placeId=" .. placeId .. " | placeName=" .. placeName)

    local success, response = pcall(function()
        return HttpService:PostAsync(url, payload, Enum.HttpContentType.ApplicationJson, false)
    end)

    if success then
        local ok, data = pcall(function() return HttpService:JSONDecode(response) end)
        if ok and data and data.token and data.project then
            self:SaveApiKey(apiKey, data.project.id)
            Logger.Info("Login efetuado! Projeto conectado: " .. data.project.name)
            BindableEvent:Fire(true, data.project.name)
            return true, "Conectado a " .. data.project.name
        else
            local err = (ok and data and data.error) or "Resposta inválida do servidor."
            return false, err
        end
    else
        Logger.Error("Erro ao logar: " .. tostring(response))
        return false, "Erro de conexão com o servidor."
    end
end

function AuthManager:TryAutoLogin()
    local apiKey = self:GetApiKey()
    if apiKey then
        Logger.Info("Tentando auto-login com a API Key salva...")
        HttpClient:SetApiKey(apiKey)
        local success, msg = self:Login(apiKey)
        if not success then
            Logger.Warn("Auto-login falhou: " .. tostring(msg))
            BindableEvent:Fire(false, nil, msg)
        end
    else
        BindableEvent:Fire(false)
    end
end

function AuthManager:Logout()
    local folder = ServerStorage:FindFirstChild(STORAGE_FOLDER_NAME)
    if folder then
        folder:ClearAllChildren()
    end
    HttpClient:SetApiKey("")
    Logger.Info("Logout efetuado.")
    BindableEvent:Fire(false)
end

function AuthManager:IsAuthenticated()
    return self:GetApiKey() ~= nil
end

return AuthManager
