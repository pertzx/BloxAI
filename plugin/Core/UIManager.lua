local UIManager = {}

function UIManager.CreateScreenGui(name, parent)
    local success, result = pcall(function()
        local sg = Instance.new("ScreenGui")
        sg.Name = name
        sg.Parent = parent
        return sg
    end)
    return success, result
end

function UIManager.CreateElement(className, parent, name, properties)
    local success, result = pcall(function()
        local el = Instance.new(className)
        el.Name = name
        if properties then
            for k, v in pairs(properties) do
                pcall(function() el[k] = v end)
            end
        end
        el.Parent = parent
        return el
    end)
    return success, result
end

return UIManager
