local AssetImporter = {}
local InsertService = game:GetService("InsertService")

local function toVector3(value)
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

    return nil
end

function AssetImporter.InsertById(assetId, parent, position)
    local success, result = pcall(function()
        local model = InsertService:LoadAsset(assetId)
        model.Parent = parent
        local vectorPosition = toVector3(position)
        if vectorPosition then
            model:MoveTo(vectorPosition)
        end
        return model
    end)
    return success, result
end

return AssetImporter
