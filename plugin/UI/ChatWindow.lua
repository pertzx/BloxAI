local UI = {}
local AuthManager = require(script.Parent.Parent.Auth.AuthManager)
local Logger = require(script.Parent.Parent.Utils.Logger)
local TweenService = game:GetService("TweenService")

-- ─── Tema (espelha os design tokens da web em client/src/index.css) ───────────
local Theme = {
    bg        = Color3.fromRGB(13, 14, 18),    -- --bg        #0d0e12
    surface   = Color3.fromRGB(20, 23, 32),    -- --bg-surface #141720
    elevated  = Color3.fromRGB(26, 31, 46),    -- --bg-elevated #1a1f2e
    hover     = Color3.fromRGB(31, 37, 56),    -- --bg-hover   #1f2538
    border    = Color3.fromRGB(38, 42, 54),    -- --border-strong (aprox. sólido)
    text      = Color3.fromRGB(241, 245, 249), -- --text-primary
    textSoft  = Color3.fromRGB(148, 163, 184), -- --text-secondary
    textMuted = Color3.fromRGB(71, 85, 105),   -- --text-muted
    accent    = Color3.fromRGB(71, 133, 255),  -- --accent     #4785FF
    purple    = Color3.fromRGB(140, 70, 255),  -- --accent-purple #8C46FF
    green     = Color3.fromRGB(16, 185, 129),  -- --accent-green
    danger    = Color3.fromRGB(248, 113, 113),
    dangerBg  = Color3.fromRGB(60, 26, 30),
    successBg = Color3.fromRGB(13, 50, 42),
}

local FONT         = Enum.Font.Gotham
local FONT_MEDIUM  = Enum.Font.GothamMedium
local FONT_BOLD    = Enum.Font.GothamBold
local FONT_CODE    = Enum.Font.Code

local RADIUS    = UDim.new(0, 12)
local RADIUS_SM = UDim.new(0, 8)

local widget = nil
local frame = nil
local isVisible = false

-- ─── Helpers de estilo ────────────────────────────────────────────────────────
local function applyCorner(instance, radius)
    local corner = Instance.new("UICorner")
    corner.CornerRadius = radius or RADIUS
    corner.Parent = instance
    return corner
end

local function applyStroke(instance, color, thickness)
    local stroke = Instance.new("UIStroke")
    stroke.Color = color or Theme.border
    stroke.Thickness = thickness or 1
    stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    stroke.Parent = instance
    return stroke
end

local function applyPadding(instance, x, y)
    local padding = Instance.new("UIPadding")
    padding.PaddingLeft = UDim.new(0, x)
    padding.PaddingRight = UDim.new(0, x)
    padding.PaddingTop = UDim.new(0, y)
    padding.PaddingBottom = UDim.new(0, y)
    padding.Parent = instance
    return padding
end

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
    frame.BackgroundColor3 = Theme.bg
    frame.BorderSizePixel = 0
    frame.Parent = widget

    self.NotificationFrame = Instance.new("Frame")
    self.NotificationFrame.Size = UDim2.new(1, -24, 0, 0)
    self.NotificationFrame.Position = UDim2.new(0, 12, 0, 12)
    self.NotificationFrame.BackgroundColor3 = Theme.surface
    self.NotificationFrame.BackgroundTransparency = 0.04
    self.NotificationFrame.BorderSizePixel = 0
    self.NotificationFrame.Visible = false
    self.NotificationFrame.ZIndex = 20
    applyCorner(self.NotificationFrame, RADIUS_SM)
    self.NotificationFrame.Parent = frame

    self.NotificationLabel = Instance.new("TextLabel")
    self.NotificationLabel.Size = UDim2.new(1, -24, 1, -18)
    self.NotificationLabel.Position = UDim2.new(0, 12, 0, 9)
    self.NotificationLabel.BackgroundTransparency = 1
    self.NotificationLabel.Text = ""
    self.NotificationLabel.TextWrapped = true
    self.NotificationLabel.TextXAlignment = Enum.TextXAlignment.Left
    self.NotificationLabel.TextYAlignment = Enum.TextYAlignment.Top
    self.NotificationLabel.Font = FONT_MEDIUM
    self.NotificationLabel.TextSize = 13
    self.NotificationLabel.TextColor3 = Theme.text
    self.NotificationLabel.ZIndex = 21
    self.NotificationLabel.Parent = self.NotificationFrame

    local header = Instance.new("Frame")
    header.Size = UDim2.new(1, 0, 0, 52)
    header.BackgroundColor3 = Theme.surface
    header.BorderSizePixel = 0
    header.Parent = frame

    local headerLine = Instance.new("Frame")
    headerLine.Size = UDim2.new(1, 0, 0, 1)
    headerLine.Position = UDim2.new(0, 0, 1, -1)
    headerLine.BackgroundColor3 = Theme.border
    headerLine.BorderSizePixel = 0
    headerLine.Parent = header

    local dot = Instance.new("Frame")
    dot.Size = UDim2.new(0, 8, 0, 8)
    dot.Position = UDim2.new(0, 16, 0.5, -4)
    dot.BackgroundColor3 = Theme.accent
    dot.BorderSizePixel = 0
    applyCorner(dot, UDim.new(1, 0))
    dot.Parent = header

    local title = Instance.new("TextLabel")
    title.Size = UDim2.new(1, -36, 1, 0)
    title.Position = UDim2.new(0, 32, 0, 0)
    title.BackgroundTransparency = 1
    title.Text = "Blox AI Workspace"
    title.TextColor3 = Theme.text
    title.Font = FONT_BOLD
    title.TextSize = 16
    title.TextXAlignment = Enum.TextXAlignment.Left
    title.Parent = header

    self.ContentContainer = Instance.new("Frame")
    self.ContentContainer.Size = UDim2.new(1, 0, 1, -52)
    self.ContentContainer.Position = UDim2.new(0, 0, 0, 52)
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
    title.TextColor3 = Theme.text
    title.Font = FONT_BOLD
    title.TextSize = 16
    title.TextXAlignment = Enum.TextXAlignment.Left
    title.LayoutOrder = 1
    title.Parent = pad

    -- Card com info do jogo detectado automaticamente
    local placeId, placeName = AuthManager:GetGameInfo()
    local gameCard = Instance.new("Frame")
    gameCard.Size = UDim2.new(1, 0, 0, 54)
    gameCard.BackgroundColor3 = Theme.elevated
    gameCard.BorderSizePixel = 0
    gameCard.LayoutOrder = 2
    applyCorner(gameCard, RADIUS_SM)
    applyStroke(gameCard)
    gameCard.Parent = pad

    local gameLabel = Instance.new("TextLabel")
    gameLabel.Size = UDim2.new(1, -20, 1, -12)
    gameLabel.Position = UDim2.new(0, 10, 0, 6)
    gameLabel.BackgroundTransparency = 1
    gameLabel.Text = "🎮 " .. placeName .. "\nPlace ID: " .. placeId
    gameLabel.TextColor3 = Theme.textSoft
    gameLabel.Font = FONT
    gameLabel.TextSize = 12
    gameLabel.TextXAlignment = Enum.TextXAlignment.Left
    gameLabel.TextYAlignment = Enum.TextYAlignment.Top
    gameLabel.TextWrapped = true
    gameLabel.Parent = gameCard

    local hint = Instance.new("TextLabel")
    hint.Size = UDim2.new(1, 0, 0, 44)
    hint.BackgroundTransparency = 1
    hint.Text = "Cole a chave da conta (dashboard web → Conectar plugin). O projeto é criado automaticamente para este jogo."
    hint.TextColor3 = Theme.textMuted
    hint.Font = FONT
    hint.TextSize = 12
    hint.TextWrapped = true
    hint.TextXAlignment = Enum.TextXAlignment.Left
    hint.TextYAlignment = Enum.TextYAlignment.Top
    hint.LayoutOrder = 3
    hint.Parent = pad

    local apiKeyInput = Instance.new("TextBox")
    apiKeyInput.Size = UDim2.new(1, 0, 0, 40)
    apiKeyInput.BackgroundColor3 = Theme.elevated
    apiKeyInput.TextColor3 = Theme.text
    apiKeyInput.PlaceholderText = "blox_xxxxxxxxxxxx"
    apiKeyInput.PlaceholderColor3 = Theme.textMuted
    apiKeyInput.Font = FONT_CODE
    apiKeyInput.TextSize = 13
    apiKeyInput.ClearTextOnFocus = false
    apiKeyInput.TextXAlignment = Enum.TextXAlignment.Left
    apiKeyInput.BorderSizePixel = 0
    apiKeyInput.LayoutOrder = 4
    applyPadding(apiKeyInput, 12, 0)
    applyCorner(apiKeyInput, RADIUS_SM)
    applyStroke(apiKeyInput)
    apiKeyInput.Parent = pad

    local errorLabel = Instance.new("TextLabel")
    errorLabel.Size = UDim2.new(1, 0, 0, 16)
    errorLabel.BackgroundTransparency = 1
    errorLabel.Text = errMsg or ""
    errorLabel.TextColor3 = Theme.danger
    errorLabel.Font = FONT
    errorLabel.TextSize = 12
    errorLabel.TextXAlignment = Enum.TextXAlignment.Left
    errorLabel.TextWrapped = true
    errorLabel.LayoutOrder = 5
    errorLabel.Parent = pad

    local btn = Instance.new("TextButton")
    btn.Size = UDim2.new(1, 0, 0, 40)
    btn.BackgroundColor3 = Theme.accent
    btn.TextColor3 = Color3.new(1, 1, 1)
    btn.Text = "Conectar"
    btn.Font = FONT_BOLD
    btn.TextSize = 14
    btn.AutoButtonColor = true
    btn.BorderSizePixel = 0
    btn.LayoutOrder = 6
    applyCorner(btn, RADIUS_SM)
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
    status.TextColor3 = Theme.green
    status.Font = FONT_BOLD
    status.TextSize = 14
    status.TextWrapped = true
    status.TextXAlignment = Enum.TextXAlignment.Left
    status.TextYAlignment = Enum.TextYAlignment.Top
    status.Parent = self.ContentContainer

    local logoutBtn = Instance.new("TextButton")
    logoutBtn.Size = UDim2.new(1, -40, 0, 40)
    logoutBtn.Position = UDim2.new(0, 20, 1, -60)
    logoutBtn.BackgroundColor3 = Theme.dangerBg
    logoutBtn.TextColor3 = Theme.danger
    logoutBtn.Text = "Sair"
    logoutBtn.Font = FONT_BOLD
    logoutBtn.TextSize = 14
    logoutBtn.AutoButtonColor = true
    logoutBtn.BorderSizePixel = 0
    applyCorner(logoutBtn, RADIUS_SM)
    logoutBtn.Parent = self.ContentContainer

    self.FeedbackLabel = Instance.new("TextLabel")
    self.FeedbackLabel.Size = UDim2.new(1, -40, 0, 20)
    self.FeedbackLabel.Position = UDim2.new(0, 20, 1, -90)
    self.FeedbackLabel.BackgroundTransparency = 1
    self.FeedbackLabel.Text = ""
    self.FeedbackLabel.TextColor3 = Theme.accent
    self.FeedbackLabel.Font = FONT
    self.FeedbackLabel.TextSize = 12
    self.FeedbackLabel.TextXAlignment = Enum.TextXAlignment.Left
    self.FeedbackLabel.Parent = self.ContentContainer

    self.CommandPreviewLabel = Instance.new("TextLabel")
    self.CommandPreviewLabel.Size = UDim2.new(1, -40, 0, 130)
    self.CommandPreviewLabel.Position = UDim2.new(0, 20, 0, 120)
    self.CommandPreviewLabel.BackgroundColor3 = Theme.surface
    self.CommandPreviewLabel.TextColor3 = Theme.textSoft
    self.CommandPreviewLabel.BorderSizePixel = 0
    self.CommandPreviewLabel.Text = "Nenhum comando em execucao."
    self.CommandPreviewLabel.TextWrapped = true
    self.CommandPreviewLabel.TextXAlignment = Enum.TextXAlignment.Left
    self.CommandPreviewLabel.TextYAlignment = Enum.TextYAlignment.Top
    self.CommandPreviewLabel.Font = FONT_CODE
    self.CommandPreviewLabel.TextSize = 12
    applyCorner(self.CommandPreviewLabel, RADIUS_SM)
    applyStroke(self.CommandPreviewLabel)
    applyPadding(self.CommandPreviewLabel, 12, 10)
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
    self.NotificationFrame.BackgroundColor3 = success and Theme.successBg or Theme.dangerBg
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
