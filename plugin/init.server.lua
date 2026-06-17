-- Blox AI Plugin - Entry Point
local plugin = plugin

if not plugin then
    return
end

local RunService = game:GetService("RunService")

-- Só roda no contexto de EDIÇÃO do Studio. Evita executar (e fazer HTTP) quando
-- o jogo está em Play/Run ou num contexto de cliente — o que causava o erro
-- "Http requests can only be executed by game server" e instâncias duplicadas.
if not RunService:IsEdit() then
    return
end

local Config = require(script.Config)
local Logger = require(script.Utils.Logger)
local UI = require(script.UI.ChatWindow)
local AuthManager = require(script.Auth.AuthManager)
local StateSync = require(script.Core.StateSync)
local CommandExecutor = require(script.Core.CommandExecutor)

local toolbar = plugin:CreateToolbar("Blox AI")
local button = toolbar:CreateButton("Open", "Abrir painel Blox AI", "rbxassetid://0") -- TODO: Add icon ID

local function onButtonClicked()
    UI:Toggle()
end

button.Click:Connect(onButtonClicked)

-- Iniciar módulos core
Logger.Info("Blox AI Plugin " .. Config.Version .. " carregado.")
AuthManager:Initialize(plugin)
UI:Initialize(plugin)
StateSync:Start()
CommandExecutor:Start()

-- Ao recarregar/desinstalar o plugin (ex.: rebuild via Rojo), para os loops para
-- não deixar instâncias zumbis rodando em paralelo.
plugin.Unloading:Connect(function()
    pcall(function() StateSync:Stop() end)
    pcall(function() CommandExecutor:Stop() end)
end)
