local AuthManager = {}
local ServerStorage = game:GetService("ServerStorage")
local HttpService = game:GetService("HttpService")
local Logger = require(script.Parent.Parent.Utils.Logger)
local Config = require(script.Parent.Parent.Config)
local HttpClient = require(script.Parent.Parent.Core.HttpClient)

local STORAGE_FOLDER_NAME = "BloxAI_Internal_Data"
local CREDS_KEY = "UserCredentials"
local API_KEY_KEY = "ProjectApiKey"

-- Eventos customizados para atualizar a UI
local BindableEvent = Instance.new("BindableEvent")
AuthManager.OnAuthChanged = BindableEvent.Event

function AuthManager:Initialize(pluginInstance)
    self.Plugin = pluginInstance
    Logger.Info("AuthManager Inicializado.")
    
    self:EnsureStorageExists()
    
    -- Tenta auto-login ao iniciar o plugin
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
end

function AuthManager:SaveCredentials(email, password)
    self:EnsureStorageExists()
    local folder = ServerStorage[STORAGE_FOLDER_NAME]
    
    local credsValue = folder:FindFirstChild(CREDS_KEY)
    if not credsValue then
        credsValue = Instance.new("StringValue")
        credsValue.Name = CREDS_KEY
        credsValue.Parent = folder
    end
    
    -- Para mvp salvamos plain/base64 simples, em produção usaríamos AES
    local data = { e = email, p = password }
    credsValue.Value = HttpService:JSONEncode(data)
end

function AuthManager:GetCredentials()
    local folder = ServerStorage:FindFirstChild(STORAGE_FOLDER_NAME)
    if folder then
        local credsValue = folder:FindFirstChild(CREDS_KEY)
        if credsValue and credsValue.Value ~= "" then
            local success, data = pcall(function()
                return HttpService:JSONDecode(credsValue.Value)
            end)
            if success then return data.e, data.p end
        end
    end
    return nil, nil
end

local PROJECT_ID_KEY = "CurrentProjectId"

function AuthManager:SaveApiKey(apiKey, projectId)
    self:EnsureStorageExists()
    local folder = ServerStorage[STORAGE_FOLDER_NAME]
    
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

function AuthManager:Login(email, password)
    local placeId = game.PlaceId
    if placeId == 0 then placeId = 123456789 end -- Fallback se for baseplate novo sem publicar
    
    local url = Config.ApiUrl .. "/plugin/auth"
    local payload = HttpService:JSONEncode({
        email = email,
        password = password,
        placeId = tostring(placeId),
        placeName = game.Name
    })
    -- #region debug-point plugin-auth-login-payload
    Logger.Debug("Plugin login tentativa | email=" .. tostring(email) .. " | placeId=" .. tostring(placeId) .. " | placeName=" .. tostring(game.Name))
    Logger.Debug("Plugin login payload size=" .. tostring(string.len(payload)) .. " | snippet=" .. string.sub(payload, 1, 250))
    -- #endregion
    
    local success, response = pcall(function()
        return HttpService:PostAsync(url, payload, Enum.HttpContentType.ApplicationJson, false)
    end)
    
    if success then
        -- #region debug-point plugin-auth-login-success-http
        Logger.Debug("Plugin login HTTP success | raw response=" .. string.sub(tostring(response), 1, 300))
        -- #endregion
        local data = HttpService:JSONDecode(response)
        if data.token and data.project then
            self:SaveCredentials(email, password)
            self:SaveApiKey(data.token, data.project.id) -- Salva o token JWT e o ID do projeto
            
            Logger.Info("Login efetuado! Projeto conectado: " .. data.project.name)
            BindableEvent:Fire(true, data.project.name)
            return true, "Conectado a " .. data.project.name
        else
            return false, data.error or "Erro desconhecido"
        end
    else
        Logger.Error("Erro ao logar: " .. tostring(response))
        -- #region debug-point plugin-auth-login-failure-http
        Logger.Debug("Plugin login HTTP failure | detail=" .. tostring(response))
        -- #endregion
        return false, "Erro de conexão com o servidor."
    end
end

function AuthManager:TryAutoLogin()
    local email, password = self:GetCredentials()
    if email and password then
        Logger.Info("Tentando auto-login...")
        local success, msg = self:Login(email, password)
        if not success then
            Logger.Warn("Auto-login falhou: " .. tostring(msg))
            BindableEvent:Fire(false)
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
    local folder = ServerStorage:FindFirstChild(STORAGE_FOLDER_NAME)
    if folder and folder:FindFirstChild(API_KEY_KEY) then
        return true
    end
    return false
end

return AuthManager
