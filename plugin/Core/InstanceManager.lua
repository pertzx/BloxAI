local InstanceManager = {}

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

    return value
end

function InstanceManager.Create(className, parent, name, properties)
    local success, result = pcall(function()
        local inst = Instance.new(className)
        inst.Name = name
        if properties then
            for k, v in pairs(properties) do
                pcall(function() inst[k] = normalizePropertyValue(k, v) end)
            end
        end
        inst.Parent = parent
        return inst
    end)
    return success, result
end

function InstanceManager.SetProperty(target, property, value)
    local success, err = pcall(function()
        target[property] = normalizePropertyValue(property, value)
    end)
    return success, err
end

function InstanceManager.Delete(target)
    local success, err = pcall(function()
        target:Destroy()
    end)
    return success, err
end

return InstanceManager
