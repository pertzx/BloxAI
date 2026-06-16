local UI = {}
local AuthManager = require(script.Parent.Parent.Auth.AuthManager)
local Logger = require(script.Parent.Parent.Utils.Logger)
local TweenService = game:GetService("TweenService")

local widget = nil
local frame = nil
local isVisible = false

function UI:Initialize(plugin)
    local widgetInfo = DockWidgetPluginGuiInfo.new(
        Enum.InitialDockState.Right,
        false,   
        false,   
        300,     
        400,     
        250,     
        300      
    )

    widget = plugin:CreateDockWidgetPluginGui("BloxAI_MainWidget", widgetInfo)
    widget.Title = "Blox AI"

    frame = Instance.new("Frame")
    frame.Size = UDim2.new(1, 0, 1, 0)
    frame.BackgroundColor3 = Color3.fromRGB(15, 23, 42) -- bg-slate-900
    frame.BorderSizePixel = 0
    frame.Parent = widget

    self.NotificationFrame = Instance.new("Frame")
    self.NotificationFrame.Size = UDim2.new(1, -24, 0, 0)
    self.NotificationFrame.Position = UDim2.new(0, 12, 0, 12)
    self.NotificationFrame.BackgroundColor3 = Color3.fromRGB(15, 23, 42)
    self.NotificationFrame.BackgroundTransparency = 0.12
    self.NotificationFrame.Visible = false
    self.NotificationFrame.ZIndex = 20
    local noticeCorner = Instance.new("UICorner")
    noticeCorner.CornerRadius = UDim.new(0, 10)
    noticeCorner.Parent = self.NotificationFrame
    self.NotificationFrame.Parent = frame

    self.NotificationLabel = Instance.new("TextLabel")
    self.NotificationLabel.Size = UDim2.new(1, -24, 1, -18)
    self.NotificationLabel.Position = UDim2.new(0, 12, 0, 9)
    self.NotificationLabel.BackgroundTransparency = 1
    self.NotificationLabel.Text = ""
    self.NotificationLabel.TextWrapped = true
    self.NotificationLabel.TextXAlignment = Enum.TextXAlignment.Left
    self.NotificationLabel.TextYAlignment = Enum.TextYAlignment.Top
    self.NotificationLabel.Font = Enum.Font.GothamSemibold
    self.NotificationLabel.TextSize = 13
    self.NotificationLabel.TextColor3 = Color3.fromRGB(248, 250, 252)
    self.NotificationLabel.ZIndex = 21
    self.NotificationLabel.Parent = self.NotificationFrame

    local header = Instance.new("Frame")
    header.Size = UDim2.new(1, 0, 0, 50)
    header.BackgroundColor3 = Color3.fromRGB(2, 6, 23) -- bg-slate-950
    header.BorderSizePixel = 0
    header.Parent = frame

    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(1, -20, 1, 0)
    title.Position = UDim2.new(0, 10, 0, 0)
    title.BackgroundTransparency = 1
    title.Text = "Blox AI Workspace"
    title.TextColor3 = Color3.fromRGB(248, 250, 252)
    title.Font = Enum.Font.GothamBold
    title.TextSize = 16
    title.TextXAlignment = Enum.TextXAlignment.Left
    title.Parent = header

    self.ContentContainer = Instance.new("Frame")
    self.ContentContainer.Size = UDim2.new(1, 0, 1, -50)
    self.ContentContainer.Position = UDim2.new(0, 0, 0, 50)
    self.ContentContainer.BackgroundTransparency = 1
    self.ContentContainer.Parent = frame

    -- Ouvir mudanças de Auth (Auto-Login, Logout)
    AuthManager.OnAuthChanged:Connect(function(isAuthenticated, projectName, errMsg)
        if isAuthenticated then
            self:RenderDashboardScreen(projectName)
        else
            self:RenderAuthScreen(errMsg)
        end
    end)

    if AuthManager:IsAuthenticated() then
        self:RenderDashboardScreen("Conectando...")
    else
        self:RenderAuthScreen()
    end
end

function UI:RenderAuthScreen(errMsg)
    self.ContentContainer:ClearAllChildren()

    -- Padding container com layout vertical
    local pad = Instance.new("Frame")
    pad.Size = UDim2.new(1, -32, 1, -16)
    pad.Position = UDim2.new(0, 16, 0, 8)
    pad.BackgroundTransparency = 1
    pad.Parent = self.ContentContainer

    local layout = Instance.new("UIListLayout")
    layout.Padding = UDim.new(0, 10)
    layout.SortOrder = Enum.SortOrder.LayoutOrder
    layout.Parent = pad

    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(1, 0, 0, 24)
    title.BackgroundTransparency = 1
    title.Text = "Conectar projeto"
    title.TextColor3 = Color3.fromRGB(248, 250, 252)
    title.Font = Enum.Font.GothamBold
    title.TextSize = 16
    title.TextXAlignment = Enum.TextXAlignment.Left
    title.LayoutOrder = 1
    title.Parent = pad

    -- Card com info do jogo detectado automaticamente
    local placeId, placeName = AuthManager:GetGameInfo()
    local gameCard = Instance.new("Frame")
    gameCard.Size = UDim2.new(1, 0, 0, 54)
    gameCard.BackgroundColor3 = Color3.fromRGB(30, 41, 59)
    gameCard.LayoutOrder = 2
    local gcCorner = Instance.new("UICorner")
    gcCorner.CornerRadius = UDim.new(0, 8)
    gcCorner.Parent = gameCard
    gameCard.Parent = pad

    local gameLabel = Instance.new("TextLabel")
    gameLabel.Size = UDim2.new(1, -20, 1, -12)
    gameLabel.Position = UDim2.new(0, 10, 0, 6)
    gameLabel.BackgroundTransparency = 1
    gameLabel.Text = "🎮 " .. placeName .. "\nPlace ID: " .. placeId
    gameLabel.TextColor3 = Color3.fromRGB(148, 163, 184)
    gameLabel.Font = Enum.Font.Gotham
    gameLabel.TextSize = 12
    gameLabel.TextXAlignment = Enum.TextXAlignment.Left
    gameLabel.TextYAlignment = Enum.TextYAlignment.Top
    gameLabel.TextWrapped = true
    gameLabel.Parent = gameCard

    local hint = Instance.new("TextLabel")
    hint.Size = UDim2.new(1, 0, 0, 16)
    hint.BackgroundTransparency = 1
    hint.Text = "Cole a API Key do projeto (dashboard web)"
    hint.TextColor3 = Color3.fromRGB(100, 116, 139)
    hint.Font = Enum.Font.Gotham
    hint.TextSize = 12
    hint.TextXAlignment = Enum.TextXAlignment.Left
    hint.LayoutOrder = 3
    hint.Parent = pad

    local apiKeyInput = Instance.new("TextBox")
    apiKeyInput.Size = UDim2.new(1, 0, 0, 40)
    apiKeyInput.BackgroundColor3 = Color3.fromRGB(30, 41, 59)
    apiKeyInput.TextColor3 = Color3.fromRGB(248, 250, 252)
    apiKeyInput.PlaceholderText = "blox_xxxxxxxxxxxx"
    apiKeyInput.PlaceholderColor3 = Color3.fromRGB(100, 116, 139)
    apiKeyInput.Font = Enum.Font.Code
    apiKeyInput.TextSize = 13
    apiKeyInput.ClearTextOnFocus = false
    apiKeyInput.TextXAlignment = Enum.TextXAlignment.Left
    apiKeyInput.LayoutOrder = 4
    local padding = Instance.new("UIPadding")
    padding.PaddingLeft = UDim.new(0, 10)
    padding.PaddingRight = UDim.new(0, 10)
    padding.Parent = apiKeyInput
    local corner1 = Instance.new("UICorner")
    corner1.CornerRadius = UDim.new(0, 8)
    corner1.Parent = apiKeyInput
    apiKeyInput.Parent = pad

    local errorLabel = Instance.new("TextLabel")
    errorLabel.Size = UDim2.new(1, 0, 0, 16)
    errorLabel.BackgroundTransparency = 1
    errorLabel.Text = errMsg or ""
    errorLabel.TextColor3 = Color3.fromRGB(248, 113, 113)
    errorLabel.Font = Enum.Font.Gotham
    errorLabel.TextSize = 12
    errorLabel.TextXAlignment = Enum.TextXAlignment.Left
    errorLabel.TextWrapped = true
    errorLabel.LayoutOrder = 5
    errorLabel.Parent = pad

    local btn = Instance.new("TextButton")
    btn.Size = UDim2.new(1, 0, 0, 40)
    btn.BackgroundColor3 = Color3.fromRGB(124, 58, 237) -- violet-600
    btn.TextColor3 = Color3.new(1, 1, 1)
    btn.Text = "Conectar"
    btn.Font = Enum.Font.GothamBold
    btn.TextSize = 14
    btn.AutoButtonColor = true
    btn.LayoutOrder = 6
    local btnCorner = Instance.new("UICorner")
    btnCorner.CornerRadius = UDim.new(0, 8)
    btnCorner.Parent = btn
    btn.Parent = pad

    btn.MouseButton1Click:Connect(function()
        if apiKeyInput.Text ~= "" then
            btn.Text = "Conectando..."
            errorLabel.Text = ""
            local success, msg = AuthManager:Login(apiKeyInput.Text)
            if not success then
                btn.Text = "Conectar"
                errorLabel.Text = msg
            end
        else
            errorLabel.Text = "Cole a API Key do projeto."
        end
    end)
end

function UI:RenderDashboardScreen(projectName)
    self.ContentContainer:ClearAllChildren()

    local _, gameName = AuthManager:GetGameInfo()

    local status = Instance.new("TextLabel")
    status.Size = UDim2.new(1, -40, 0, 90)
    status.Position = UDim2.new(0, 20, 0, 20)
    status.BackgroundTransparency = 1
    status.Text = "🟢 Conectado!\nProjeto: " .. (projectName or "Auto") .. "\nJogo: " .. (gameName or "—") .. "\n\nAguardando comandos da Web..."
    status.TextColor3 = Color3.fromRGB(74, 222, 128)
    status.Font = Enum.Font.GothamBold
    status.TextSize = 14
    status.TextWrapped = true
    status.TextYAlignment = Enum.TextYAlignment.Top
    status.Parent = self.ContentContainer

    local logoutBtn = Instance.new("TextButton")
    logoutBtn.Size = UDim2.new(1, -40, 0, 40)
    logoutBtn.Position = UDim2.new(0, 20, 1, -60)
    logoutBtn.BackgroundColor3 = Color3.fromRGB(127, 29, 29) 
    logoutBtn.TextColor3 = Color3.fromRGB(248, 113, 113) 
    logoutBtn.Text = "Sair"
    logoutBtn.Font = Enum.Font.GothamBold
    logoutBtn.TextSize = 14
    local btnCorner = Instance.new("UICorner")
    btnCorner.CornerRadius = UDim.new(0, 6)
    btnCorner.Parent = logoutBtn
    logoutBtn.Parent = self.ContentContainer

    self.FeedbackLabel = Instance.new("TextLabel")
    self.FeedbackLabel.Size = UDim2.new(1, -40, 0, 20)
    self.FeedbackLabel.Position = UDim2.new(0, 20, 1, -90)
    self.FeedbackLabel.BackgroundTransparency = 1
    self.FeedbackLabel.Text = ""
    self.FeedbackLabel.TextColor3 = Color3.fromRGB(147, 197, 253) -- blue-300
    self.FeedbackLabel.Font = Enum.Font.Gotham
    self.FeedbackLabel.TextSize = 12
    self.FeedbackLabel.Parent = self.ContentContainer

    self.CommandPreviewLabel = Instance.new("TextLabel")
    self.CommandPreviewLabel.Size = UDim2.new(1, -40, 0, 130)
    self.CommandPreviewLabel.Position = UDim2.new(0, 20, 0, 120)
    self.CommandPreviewLabel.BackgroundColor3 = Color3.fromRGB(15, 23, 42)
    self.CommandPreviewLabel.TextColor3 = Color3.fromRGB(226, 232, 240)
    self.CommandPreviewLabel.BorderSizePixel = 0
    self.CommandPreviewLabel.Text = "Nenhum comando em execucao."
    self.CommandPreviewLabel.TextWrapped = true
    self.CommandPreviewLabel.TextXAlignment = Enum.TextXAlignment.Left
    self.CommandPreviewLabel.TextYAlignment = Enum.TextYAlignment.Top
    self.CommandPreviewLabel.Font = Enum.Font.Code
    self.CommandPreviewLabel.TextSize = 12
    local previewCorner = Instance.new("UICorner")
    previewCorner.CornerRadius = UDim.new(0, 8)
    previewCorner.Parent = self.CommandPreviewLabel
    self.CommandPreviewLabel.Parent = self.ContentContainer

    logoutBtn.MouseButton1Click:Connect(function()
        AuthManager:Logout()
    end)
end

function UI:ShowFeedback(msg, color)
    if self.FeedbackLabel then
        self.FeedbackLabel.Text = msg
        if color then
            self.FeedbackLabel.TextColor3 = color
        end
        task.delay(3, function()
            if self.FeedbackLabel.Text == msg then
                self.FeedbackLabel.Text = ""
            end
        end)
    end
end

function UI:ShowCommandPreview(command)
    if not self.CommandPreviewLabel then
        return
    end

    local payload = command and command.payload or {}
    local lines = {
        "Acao: " .. tostring(command and command.action or "Unknown"),
    }

    if command and command.action == "CreateScript" then
        table.insert(lines, "Script: " .. tostring(payload.name or "NewScript"))
        table.insert(lines, "Parent: " .. tostring(payload.parent or "workspace"))
        table.insert(lines, "Tipo: " .. tostring(payload.scriptType or "Script"))
        table.insert(lines, "Conteudo:")
        table.insert(lines, tostring(payload.source or ""))
    elseif command and command.action == "RunLuau" then
        table.insert(lines, "Linguagem: " .. tostring(payload.language or "luau"))
        table.insert(lines, "Conteudo:")
        table.insert(lines, tostring(payload.source or ""))
    else
        for key, value in pairs(payload) do
            table.insert(lines, tostring(key) .. ": " .. tostring(value))
        end
    end

    local preview = table.concat(lines, "\n")
    if string.len(preview) > 700 then
        preview = string.sub(preview, 1, 697) .. "..."
    end
    self.CommandPreviewLabel.Text = preview
end

function UI:ShowRequestCompleted(success, detail)
    if not self.NotificationFrame or not self.NotificationLabel then
        return
    end

    self.NotificationFrame.Visible = true
    self.NotificationFrame.Size = UDim2.new(1, -24, 0, 0)
    self.NotificationFrame.BackgroundColor3 = success and Color3.fromRGB(6, 95, 70) or Color3.fromRGB(127, 29, 29)
    self.NotificationLabel.Text = (success and "Ultima requisicao concluida.\n" or "Ultima requisicao terminou com erro.\n") .. tostring(detail or "")

    local expandTween = TweenService:Create(
        self.NotificationFrame,
        TweenInfo.new(0.25, Enum.EasingStyle.Quint, Enum.EasingDirection.Out),
        { Size = UDim2.new(1, -24, 0, 78) }
    )
    expandTween:Play()

    task.delay(4, function()
        if not self.NotificationFrame then
            return
        end
        local collapseTween = TweenService:Create(
            self.NotificationFrame,
            TweenInfo.new(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
            { Size = UDim2.new(1, -24, 0, 0) }
        )
        collapseTween:Play()
        collapseTween.Completed:Wait()
        if self.NotificationFrame then
            self.NotificationFrame.Visible = false
        end
    end)
end

function UI:Toggle()
    if widget then
        isVisible = not isVisible
        widget.Enabled = isVisible
    end
end

return UI
