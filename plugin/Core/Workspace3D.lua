local Workspace3D = {}

local function toVector3(value, fallback)
    if typeof(value) == "Vector3" then
        return value
    end

    if type(value) == "table" then
        local x = tonumber(value.x or value.X)
        local y = tonumber(value.y or value.Y)
        local z = tonumber(value.z or value.Z)
        if x and y and z then
            return Vector3.new(x, y, z)
        end
    end

    return fallback
end

local function toColor3(value)
    if typeof(value) == "Color3" then
        return value
    end

    if type(value) == "table" then
        local r = tonumber(value.r or value.R)
        local g = tonumber(value.g or value.G)
        local b = tonumber(value.b or value.B)
        if r and g and b then
            if r > 1 or g > 1 or b > 1 then
                return Color3.fromRGB(math.clamp(r, 0, 255), math.clamp(g, 0, 255), math.clamp(b, 0, 255))
            end
            return Color3.new(math.clamp(r, 0, 1), math.clamp(g, 0, 1), math.clamp(b, 0, 1))
        end
    end

    return nil
end

local function normalizePropertyValue(propertyName, value)
    if propertyName == "Color" or propertyName == "Color3" then
        return toColor3(value) or value
    end

    if propertyName == "Material" and type(value) == "string" then
        return Enum.Material[value] or value
    end

    if propertyName == "Position" or propertyName == "Size" then
        return toVector3(value, value)
    end

    return value
end

function Workspace3D.CreatePart(shape, position, size, properties)
    local success, result = pcall(function()
        local part = Instance.new("Part")
        part.Shape = Enum.PartType[shape] or Enum.PartType.Block
        part.Position = toVector3(position, Vector3.new(0, 5, 0))
        part.Size = toVector3(size, Vector3.new(4, 1, 4))
        if properties then
            for k, v in pairs(properties) do
                pcall(function() part[k] = normalizePropertyValue(k, v) end)
            end
        end
        part.Parent = workspace
        return part
    end)
    return success, result
end

function Workspace3D.MoveTo(targetPart, newPosition)
    local success, err = pcall(function()
        targetPart.Position = toVector3(newPosition, targetPart.Position)
    end)
    return success, err
end

return Workspace3D
