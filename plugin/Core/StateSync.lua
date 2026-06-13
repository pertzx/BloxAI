local StateSync = {}
local HttpClient = require(script.Parent.HttpClient)
local Logger = require(script.Parent.Parent.Utils.Logger)
local Config = require(script.Parent.Parent.Config)
local AuthManager = require(script.Parent.Parent.Auth.AuthManager)
local UI = require(script.Parent.Parent.UI.ChatWindow)

local connectionCache = {}
local syncedProjectId = nil
local fullSyncScheduled = false
local MAX_TABLE_DEPTH = 3
local lastSyncedTreeSignature = nil

local function getTrackedServices()
    local services = {
        game.Workspace,
        game:GetService("ReplicatedStorage"),
        game:GetService("ReplicatedFirst"),
        game:GetService("ServerScriptService"),
        game:GetService("ServerStorage"),
        game:GetService("StarterGui"),
        game:GetService("StarterPack"),
        game:GetService("StarterPlayer"),
        game:GetService("SoundService"),
        game:GetService("Lighting"),
        game:GetService("Teams"),
    }

    return services
end

local function countTreeNodes(nodes)
    local count = 0
    for _, node in ipairs(nodes) do
        count = count + 1
        if node.filhos then
            count = count + countTreeNodes(node.filhos)
        end
    end
    return count
end

local function shouldTrackInstance(instance)
    return instance ~= nil
end

local function getInstanceSortKey(instance)
    return string.lower(instance.Name) .. "|" .. tostring(instance.ClassName)
end

local function getSortedChildren(instance)
    local children = instance:GetChildren()
    table.sort(children, function(a, b)
        return getInstanceSortKey(a) < getInstanceSortKey(b)
    end)
    return children
end

local function serializeValue(value, depth)
    depth = depth or 0
    local valueType = typeof(value)

    if valueType == "nil" then
        return nil
    end

    if valueType == "string" or valueType == "number" or valueType == "boolean" then
        return value
    end

    if valueType == "table" then
        if depth >= MAX_TABLE_DEPTH then
            return "<max-depth>"
        end

        local result = {}
        for key, nestedValue in pairs(value) do
            result[tostring(key)] = serializeValue(nestedValue, depth + 1)
        end
        return result
    end

    if valueType == "Vector3" then
        return { x = value.X, y = value.Y, z = value.Z }
    end

    if valueType == "Vector2" then
        return { x = value.X, y = value.Y }
    end

    if valueType == "Color3" then
        return { r = value.R, g = value.G, b = value.B }
    end

    if valueType == "UDim2" then
        return {
            xScale = value.X.Scale,
            xOffset = value.X.Offset,
            yScale = value.Y.Scale,
            yOffset = value.Y.Offset
        }
    end

    if valueType == "CFrame" then
        local x, y, z = value.Position.X, value.Position.Y, value.Position.Z
        return { x = x, y = y, z = z }
    end

    if valueType == "BrickColor" then
        return tostring(value)
    end

    if valueType == "Rect" then
        return {
            min = { x = value.Min.X, y = value.Min.Y },
            max = { x = value.Max.X, y = value.Max.Y }
        }
    end

    if valueType == "UDim" then
        return {
            scale = value.Scale,
            offset = value.Offset
        }
    end

    if valueType == "NumberRange" then
        return {
            min = value.Min,
            max = value.Max
        }
    end

    if valueType == "ColorSequence" or valueType == "NumberSequence" then
        return tostring(value)
    end

    if valueType == "Axes" or valueType == "Faces" then
        return tostring(value)
    end

    if valueType == "EnumItem" then
        return tostring(value)
    end

    if valueType == "Instance" then
        return value:GetFullName()
    end

    return tostring(value)
end

local function readProperty(instance, propertyName)
    local success, value = pcall(function()
        return instance[propertyName]
    end)

    if not success then
        return nil
    end

    return serializeValue(value)
end

local function appendProperties(instance, properties, propertyNames)
    for _, propertyName in ipairs(propertyNames) do
        if properties[propertyName] == nil then
            local value = readProperty(instance, propertyName)
            if value ~= nil then
                properties[propertyName] = value
            end
        end
    end
end

local function readAttributes(instance)
    local success, attributes = pcall(function()
        return instance:GetAttributes()
    end)

    if not success or type(attributes) ~= "table" then
        return nil
    end

    local result = {}
    for key, value in pairs(attributes) do
        result[tostring(key)] = serializeValue(value)
    end

    if next(result) == nil then
        return nil
    end

    return result
end

local function buildStableSignature(value)
    local valueType = typeof(value)

    if valueType == "nil" then
        return "null"
    end

    if valueType == "string" then
        return string.format("%q", value)
    end

    if valueType == "number" or valueType == "boolean" then
        return tostring(value)
    end

    if valueType == "table" then
        local isArray = #value > 0

        if isArray then
            local parts = {}
            for index = 1, #value do
                parts[index] = buildStableSignature(value[index])
            end
            return "[" .. table.concat(parts, ",") .. "]"
        end

        local keys = {}
        for key in pairs(value) do
            table.insert(keys, tostring(key))
        end
        table.sort(keys)

        local parts = {}
        for _, key in ipairs(keys) do
            table.insert(parts, key .. ":" .. buildStableSignature(value[key]))
        end
        return "{" .. table.concat(parts, ",") .. "}"
    end

    return tostring(value)
end

local function extractProperties(instance)
    local properties = {
        ClassName = instance.ClassName,
        Path = instance:GetFullName(),
        Parent = instance.Parent and instance.Parent:GetFullName() or nil,
        Name = instance.Name,
        Archivable = readProperty(instance, "Archivable"),
        ChildCount = #instance:GetChildren(),
    }

    local commonProperties = {
        "ClassName",
        "UniqueId",
        "SourceAssetId",
        "Enabled",
        "Disabled",
        "Visible",
        "Active",
        "Value",
        "Tags",
        "AttributesReplicate",
        "Transparency",
        "Size",
        "Position",
        "Orientation",
        "CFrame",
        "Rotation",
        "PivotOffset",
        "WorldPivot",
        "Anchored",
        "CanCollide",
        "CanQuery",
        "CanTouch",
        "CastShadow",
        "Massless",
        "Reflectance",
        "RootPriority",
        "AssemblyLinearVelocity",
        "AssemblyAngularVelocity",
        "Material",
        "Color",
        "BrickColor",
        "Shape",
        "Text",
        "TextSize",
        "TextScaled",
        "TextWrapped",
        "TextTransparency",
        "TextStrokeTransparency",
        "RichText",
        "FontFace",
        "TextXAlignment",
        "TextYAlignment",
        "TextColor3",
        "BackgroundColor3",
        "BackgroundTransparency",
        "BorderColor3",
        "BorderSizePixel",
        "AnchorPoint",
        "AutomaticSize",
        "LayoutOrder",
        "ZIndex",
        "SizeConstraint",
        "ClipsDescendants",
        "Image",
        "ImageColor3",
        "ImageTransparency",
        "ScaleType",
        "SliceCenter",
        "ResampleMode",
        "SoundId",
        "Volume",
        "PlaybackSpeed",
        "TimeLength",
        "TimePosition",
        "Playing",
        "RollOffMaxDistance",
        "RollOffMinDistance",
        "EmitterSize",
        "RunContext",
        "Looped",
        "Pitch",
        "WalkSpeed",
        "JumpPower",
        "UseJumpPower",
        "HipHeight",
        "AutoRotate",
        "Health",
        "MaxHealth",
        "DisplayName",
        "FloorMaterial",
        "RigType",
        "Locked",
        "CurrentCamera",
        "CameraType",
        "FieldOfView",
        "Brightness",
        "Range",
        "Shadows",
        "Face",
        "ShapeStyle",
        "MeshId",
        "TextureID",
        "ToolTip",
        "RequiresHandle",
        "CanBeDropped",
        "Grip",
        "PrimaryPart",
        "WorldPosition",
        "WorldOrientation",
        "WorldCFrame",
        "Axis",
        "SecondaryAxis",
        "Style",
        "Interactable",
        "MaxVisibleGraphemes",
        "PlaceholderText",
        "ClearTextOnFocus",
        "MultiLine",
        "Checked",
        "CanvasSize",
        "CanvasPosition",
        "ScrollBarThickness",
        "ScrollingDirection",
        "AbsoluteSize",
        "AbsolutePosition",
        "AbsoluteCanvasSize",
        "AbsoluteRotation",
        "SelectionOrder",
        "Visible",
        "Adornee",
        "AlwaysOnTop",
        "ExtentsOffset",
        "StudsOffset",
        "LightInfluence",
        "ResetOnSpawn",
        "IgnoreGuiInset",
        "DisplayOrder",
        "OnTopOfCoreBlur",
        "Modal",
        "Status",
        "MaterialVariant",
        "CollisionGroup",
        "CanPivot",
    }

    appendProperties(instance, properties, commonProperties)

    local attributes = readAttributes(instance)
    if attributes then
        properties.Attributes = attributes
    end

    if instance:IsA("Script") or instance:IsA("LocalScript") or instance:IsA("ModuleScript") then
        properties.Source = readProperty(instance, "Source")
        properties.IsScript = true
        properties.ScriptType = instance.ClassName
        appendProperties(instance, properties, {
            "LinkedSource",
            "Enabled",
            "Disabled",
            "RunContext",
        })
    end

    if instance:IsA("BasePart") then
        properties.IsPhysical = true
        appendProperties(instance, properties, {
            "BottomSurface",
            "TopSurface",
            "BottomSurfaceInput",
            "TopSurfaceInput",
            "MaterialVariant",
            "CollisionGroup",
            "AssemblyMass",
            "CustomPhysicalProperties",
        })
    end

    if instance:IsA("GuiObject") then
        properties.IsGui = true
        appendProperties(instance, properties, {
            "Selectable",
            "SelectionImageObject",
            "NextSelectionUp",
            "NextSelectionDown",
            "NextSelectionLeft",
            "NextSelectionRight",
        })
    end

    if instance:IsA("Sound") then
        properties.IsSound = true
        appendProperties(instance, properties, {
            "SoundGroup",
            "PlaybackRegionsEnabled",
            "Playing",
            "IsLoaded",
        })
    end

    if instance:IsA("Model") then
        appendProperties(instance, properties, {
            "LevelOfDetail",
            "ModelStreamingMode",
            "PrimaryPart",
            "WorldPivot",
        })
    end

    if instance:IsA("Tool") then
        appendProperties(instance, properties, {
            "Enabled",
            "GripForward",
            "GripPos",
            "GripRight",
            "GripUp",
        })
    end

    if instance:IsA("Humanoid") then
        appendProperties(instance, properties, {
            "BreakJointsOnDeath",
            "EvaluateStateMachine",
            "SeatPart",
            "TargetPoint",
        })
    end

    if instance:IsA("Camera") then
        appendProperties(instance, properties, {
            "CameraSubject",
            "CameraType",
            "FieldOfViewMode",
            "Focus",
        })
    end

    if instance:IsA("Light") then
        appendProperties(instance, properties, {
            "Angle",
            "Face",
            "Shadows",
        })
    end

    if instance:IsA("TextBox") then
        appendProperties(instance, properties, {
            "CursorPosition",
            "SelectionStart",
            "PlaceholderColor3",
            "TextEditable",
        })
    end

    if instance:IsA("RemoteEvent") or instance:IsA("RemoteFunction") or instance:IsA("BindableEvent") or instance:IsA("BindableFunction") then
        properties.IsRemote = true
    end

    if instance:IsA("ValueBase") then
        properties.IsValueObject = true
    end

    return properties
end

local function buildNode(instance)
    local node = {
        nome = instance.Name,
        propriedades = extractProperties(instance),
        filhos = {}
    }

    for _, child in ipairs(getSortedChildren(instance)) do
        if shouldTrackInstance(child) then
            table.insert(node.filhos, buildNode(child))
        end
    end

    return node
end

local function collectNodes()
    local nodes = {}
    local services = getTrackedServices()

    for _, service in ipairs(services) do
        table.insert(nodes, buildNode(service))
    end

    return nodes
end

function StateSync:ScheduleFullSync(delaySeconds)
    if fullSyncScheduled then
        return
    end

    fullSyncScheduled = true
    task.delay(delaySeconds or 0.5, function()
        fullSyncScheduled = false
        self:PerformFullSync()
    end)
end

function StateSync:PerformFullSync()
    if not AuthManager:IsAuthenticated() then
        return false
    end

    local projectId = AuthManager:GetProjectId()
    if not projectId then
        return false
    end

    local tree = collectNodes()
    local treeSignature = buildStableSignature(tree)

    if syncedProjectId == projectId and lastSyncedTreeSignature == treeSignature then
        return false
    end

    local success = HttpClient:Post("/projects/" .. projectId .. "/sync", {
        type = "FullSync",
        tree = tree
    })

    if success then
        syncedProjectId = projectId
        lastSyncedTreeSignature = treeSignature
        UI:ShowFeedback("Explorer sincronizado", Color3.fromRGB(134, 239, 172))
    end

    return success
end

function StateSync:Start()
    Logger.Info("StateSync Iniciado. Monitorando servicos principais do jogo inteiro.")

    for _, service in ipairs(getTrackedServices()) do
        service.DescendantAdded:Connect(function(descendant)
            self:SendDiff("Added", descendant)
        end)

        service.DescendantRemoving:Connect(function(descendant)
            self:SendDiff("Removed", descendant)
        end)
    end
    
    -- Sync periodico completo: varre a arvore inteira e so reenvía quando o snapshot mudar.
    task.spawn(function()
        while true do
            task.wait(Config.SyncInterval)
            if AuthManager:IsAuthenticated() then
                local projectId = AuthManager:GetProjectId()
                if projectId then
                    local didFullSync = false
                    if syncedProjectId ~= projectId then
                        lastSyncedTreeSignature = nil
                        didFullSync = self:PerformFullSync()
                    else
                        didFullSync = self:PerformFullSync()
                    end

                    local success = HttpClient:Post("/projects/" .. projectId .. "/sync", {
                        type = "Heartbeat",
                        timestamp = os.time()
                    })
                    if success then
                        if didFullSync then
                            UI:ShowFeedback("Explorer atualizado", Color3.fromRGB(134, 239, 172))
                        else
                            UI:ShowFeedback("Sincronizado", Color3.fromRGB(134, 239, 172))
                        end
                    end
                end
            end
        end
    end)
end

function StateSync:SendDiff(actionType, instance)
    if not AuthManager:IsAuthenticated() then return end
    local projectId = AuthManager:GetProjectId()
    if not projectId then return end
    if not shouldTrackInstance(instance) then return end

    lastSyncedTreeSignature = nil
    self:ScheduleFullSync(0.75)
end

return StateSync
