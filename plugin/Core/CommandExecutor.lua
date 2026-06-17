local CommandExecutor = {}

local ScriptManager = require(script.Parent.ScriptManager)
local InstanceManager = require(script.Parent.InstanceManager)
local Workspace3D = require(script.Parent.Workspace3D)
local UIManager = require(script.Parent.UIManager)
local AssetImporter = require(script.Parent.AssetImporter)
local Logger = require(script.Parent.Parent.Utils.Logger)
local HttpClient = require(script.Parent.HttpClient)
local HttpService = game:GetService("HttpService")
local ServerScriptService = game:GetService("ServerScriptService")

local running = false

local function resolveInstanceReference(reference)
    if reference == nil then
        return nil
    end

    if typeof(reference) == "Instance" then
        return reference
    end

    if type(reference) ~= "string" then
        return nil
    end

    local normalized = string.lower(reference)
    if normalized == "workspace" then
        return workspace
    end

    if normalized == "game" then
        return game
    end

    local current = game
    for segment in string.gmatch(reference, "[^%.]+") do
        if string.lower(segment) ~= "game" then
            current = current and current:FindFirstChild(segment) or nil
        end
    end

    return current
end

local function destroySafely(instance)
    if typeof(instance) ~= "Instance" then
        return
    end

    pcall(function()
        instance:Destroy()
    end)
end

local FREE_SOURCE_TIMEOUT_SECONDS = 15

-- Executa `fn` protegido com um deadline. Retorna (finished, ok, result).
-- OBS: Luau é cooperativo. Um loop apertado SEM yield (ex.: `while true do end`)
-- não pode ser interrompido e ainda congela o Studio inteiro — isso é uma
-- limitação da engine. Este watchdog cobre scripts que cedem (task.wait, chamadas
-- assíncronas) e estouram o tempo, evitando travar o loop de execução para sempre.
local function runWithTimeout(fn, timeoutSeconds)
    local finished, ok, result = false, false, nil
    task.spawn(function()
        ok, result = pcall(fn)
        finished = true
    end)

    local startedAt = os.clock()
    while not finished and (os.clock() - startedAt) < timeoutSeconds do
        task.wait(0.05)
    end

    return finished, ok, result
end

local function buildFreeSourceError(code, summary, detail, source)
    return {
        ok = false,
        code = code,
        summary = summary,
        detail = detail,
        sourcePreview = string.sub(tostring(source or ""), 1, 220),
    }
end

local function normalizeFreeSourceSuccess(result, executorStrategy)
    if type(result) == "table" then
        if result.ok == false then
            return false, result
        end

        if result.ok == nil then
            result.ok = true
        end

        if result.executorStrategy == nil then
            result.executorStrategy = executorStrategy
        end

        return true, result
    end

    return true, {
        ok = true,
        summary = tostring(result),
        value = result,
        executorStrategy = executorStrategy,
    }
end

local function executeFreeLuauViaTemporaryModule(source)
    local moduleName = "_BloxAIExec_" .. string.gsub(HttpService:GenerateGUID(false), "%-", "")
    local wrappedSource = table.concat({
        "-- Blox AI temporary free-source executor",
        "return function()",
        tostring(source or ""),
        "end",
    }, "\n")

    local created, moduleOrError = ScriptManager.Create("ModuleScript", ServerScriptService, moduleName, wrappedSource)
    if not created or typeof(moduleOrError) ~= "Instance" then
        return false, buildFreeSourceError(
            "FREE_SOURCE_TEMP_MODULE_CREATE_FAILED",
            "Nao foi possivel criar o modulo temporario para executar o source livre.",
            tostring(moduleOrError),
            source
        )
    end

    local moduleScript = moduleOrError
    local requireOk, exported = pcall(require, moduleScript)
    if not requireOk then
        destroySafely(moduleScript)
        return false, buildFreeSourceError(
            "FREE_SOURCE_TEMP_MODULE_REQUIRE_FAILED",
            "O modulo temporario do source livre falhou ao compilar ou carregar.",
            tostring(exported),
            source
        )
    end

    if type(exported) ~= "function" then
        destroySafely(moduleScript)
        return false, buildFreeSourceError(
            "FREE_SOURCE_TEMP_MODULE_INVALID_EXPORT",
            "O source livre nao exportou uma funcao executavel no fallback por ModuleScript.",
            "O wrapper retornou um valor inesperado: " .. typeof(exported),
            source
        )
    end

    local finished, runOk, result = runWithTimeout(exported, FREE_SOURCE_TIMEOUT_SECONDS)
    destroySafely(moduleScript)
    if not finished then
        return false, buildFreeSourceError(
            "FREE_SOURCE_TEMP_MODULE_TIMEOUT",
            "O source livre excedeu o tempo limite no fallback por ModuleScript e foi considerado travado.",
            "Nao retornou em " .. FREE_SOURCE_TIMEOUT_SECONDS .. "s.",
            source
        )
    end
    if not runOk then
        return false, buildFreeSourceError(
            "FREE_SOURCE_TEMP_MODULE_RUNTIME_FAILED",
            "O source livre falhou durante a execucao do fallback por ModuleScript.",
            tostring(result),
            source
        )
    end

    if result == nil then
        -- Código rodou sem erro e não retornou tabela de resumo. Isso é SUCESSO
        -- (a maioria dos scripts úteis só cria instâncias e não retorna nada).
        return true, {
            ok = true,
            summary = "Código executado com sucesso (sem tabela de resumo retornada).",
            executorStrategy = "temporary-module",
        }
    end

    return normalizeFreeSourceSuccess(result, "temporary-module")
end

local function executeFreeLuau(payload)
    local source = tostring(payload.source or "")
    if source == "" then
        return false, buildFreeSourceError(
            "FREE_SOURCE_EMPTY",
            "Comando livre vazio.",
            "A execution chegou sem source executavel.",
            source
        )
    end

    if type(loadstring) ~= "function" then
        return executeFreeLuauViaTemporaryModule(source)
    end

    local chunk, compileError = loadstring(source)
    if not chunk then
        return false, buildFreeSourceError(
            "FREE_SOURCE_LOADSTRING_COMPILE_FAILED",
            "O source livre falhou na compilacao via loadstring.",
            tostring(compileError),
            source
        )
    end

    local finished, ok, result = runWithTimeout(chunk, FREE_SOURCE_TIMEOUT_SECONDS)
    if not finished then
        return false, buildFreeSourceError(
            "FREE_SOURCE_LOADSTRING_TIMEOUT",
            "O source livre excedeu o tempo limite via loadstring e foi considerado travado.",
            "Nao retornou em " .. FREE_SOURCE_TIMEOUT_SECONDS .. "s. Loops sem yield nao podem ser interrompidos no Luau.",
            source
        )
    end
    if not ok then
        return false, buildFreeSourceError(
            "FREE_SOURCE_LOADSTRING_RUNTIME_FAILED",
            "O source livre falhou durante a execucao via loadstring.",
            tostring(result),
            source
        )
    end

    if result == nil then
        -- Código rodou sem erro e não retornou tabela de resumo. Isso é SUCESSO
        -- (a maioria dos scripts úteis só cria instâncias e não retorna nada).
        return true, {
            ok = true,
            summary = "Código executado com sucesso (sem tabela de resumo retornada).",
            executorStrategy = "loadstring",
        }
    end

    return normalizeFreeSourceSuccess(result, "loadstring")
end

local function serializeValue(value, depth)
    depth = depth or 0
    if depth > 4 then
        return "<max-depth>"
    end

    local valueType = typeof(value)
    if valueType == "Instance" then
        return {
            type = "Instance",
            className = value.ClassName,
            name = value.Name,
            path = value:GetFullName(),
        }
    end

    if valueType == "Vector3" then
        return { x = value.X, y = value.Y, z = value.Z }
    end

    if valueType == "Color3" then
        return { r = value.R, g = value.G, b = value.B }
    end

    if valueType == "table" then
        local output = {}
        for key, item in pairs(value) do
            output[tostring(key)] = serializeValue(item, depth + 1)
        end
        return output
    end

    return value
end

local function serializeCommandResult(command, success, result)
    return {
        action = command.action,
        success = success,
        result = serializeValue(result),
    }
end

function CommandExecutor:ExecuteCommand(command)
    Logger.Info("Executando comando: " .. command.action)
    local success, result = false, nil
    local payload = command.payload or {}
    
    if command.action == "CreateScript" then
        success, result = ScriptManager.Create(payload.scriptType, resolveInstanceReference(payload.parent) or workspace, payload.name, payload.source)
    elseif command.action == "CreatePart" then
        success, result = Workspace3D.CreatePart(payload.shape, payload.position, payload.size, payload.properties)
    elseif command.action == "InsertAsset" then
        success, result = AssetImporter.InsertById(payload.assetId, resolveInstanceReference(payload.parent) or workspace, payload.position)
    elseif command.action == "CreateInstance" then
        success, result = InstanceManager.Create(payload.className, resolveInstanceReference(payload.parent) or workspace, payload.name, payload.properties)
    elseif command.action == "SetInstanceProperty" then
        success, result = InstanceManager.SetProperty(resolveInstanceReference(payload.target), payload.property, payload.value)
    elseif command.action == "RunLuau" then
        success, result = executeFreeLuau(payload)
    else
        Logger.Warn("Ação desconhecida: " .. command.action)
    end
    
    return success, result
end

function CommandExecutor:Stop()
    running = false
end

function CommandExecutor:Start()
    if running then return end
    running = true
    Logger.Info("CommandExecutor Iniciado. Aguardando comandos da fila...")
    local AuthManager = require(script.Parent.Parent.Auth.AuthManager)
    local UI = require(script.Parent.Parent.UI.ChatWindow)

    -- Polling real na API
    task.spawn(function()
        while running do
            if AuthManager:IsAuthenticated() then
                -- Informa o projeto aberto no Studio para não puxar comando do jogo errado.
                local projectId = AuthManager:GetProjectId()
                local nextEndpoint = "/commands/next"
                if projectId then
                    nextEndpoint = nextEndpoint .. "?projectId=" .. tostring(projectId)
                end
                local success, response = HttpClient:Get(nextEndpoint)
                if success and response and response.command then
                    UI:ShowCommandPreview(response.command)
                    UI:ShowFeedback("Executando " .. tostring(response.command.action) .. "...", Color3.fromRGB(253, 224, 71))
                    
                    local execSuccess, result = self:ExecuteCommand(response.command)
                    
                    -- Reportar resultado para o backend
                    local serializedResult = serializeCommandResult(response.command, execSuccess, result)
                    local reportSuccess, reportResponse = HttpClient:Post("/commands/" .. response.command._id .. "/result", {
                        success = execSuccess,
                        result = serializedResult
                    })
                    
                    if execSuccess then
                        UI:ShowFeedback("Comando Sucesso", Color3.fromRGB(134, 239, 172))
                    else
                        UI:ShowFeedback("Erro Comando", Color3.fromRGB(248, 113, 113))
                    end

                    if reportSuccess and reportResponse and reportResponse.requestCompleted then
                        UI:ShowRequestCompleted(
                            reportResponse.requestStatus == "DONE",
                            reportResponse.latestError or reportResponse.resultSummary or reportResponse.requestStatus or "Requisicao finalizada."
                        )
                    elseif reportSuccess and reportResponse and reportResponse.followUpGenerated then
                        UI:ShowRequestCompleted(false, "A IA gerou uma correcao e esta aguardando nova aprovacao na dashboard.")
                    end
                end
            end
            task.wait(1) -- Throttle para não floodar
        end
    end)
end

return CommandExecutor
