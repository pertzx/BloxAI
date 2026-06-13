local ScriptManager = {}

function ScriptManager.Create(scriptType, parent, name, source)
    local success, result = pcall(function()
        local resolvedType = (scriptType == "LocalScript" or scriptType == "ModuleScript") and scriptType or "Script"
        local newScript = Instance.new(resolvedType)
        newScript.Name = name
        newScript.Parent = parent
        newScript.Source = tostring(source or "")
        return newScript
    end)
    return success, result
end

function ScriptManager.Edit(targetScript, newSource)
    local success, err = pcall(function()
        targetScript.Source = newSource
    end)
    return success, err
end

function ScriptManager.Delete(targetScript)
    local success, err = pcall(function()
        targetScript:Destroy()
    end)
    return success, err
end

return ScriptManager
