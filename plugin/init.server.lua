-- Blox AI Plugin - Entry Point
local plugin = plugin

if not plugin then
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
