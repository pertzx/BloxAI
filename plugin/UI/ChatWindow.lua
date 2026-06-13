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
    AuthManager.OnAuthChanged:Connect(function(isAuthenticated, projectName)
        if isAuthenticated then
            self:RenderDashboardScreen(projectName)
        else
            self:RenderAuthScreen()
        end
    end)

    if AuthManager:IsAuthenticated() then
        -- Se já tiver a key, mostramos dashboard pendente de nome real (ou podemos puxar da api dps)
        self:RenderDashboardScreen("Seu Projeto")
    else
        self:RenderAuthScreen()
    end
end

function UI:RenderAuthScreen()
    self.ContentContainer:ClearAllChildren()

    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, -40, 0, 40)
    label.Position = UDim2.new(0, 20, 0, 10)
    label.BackgroundTransparency = 1
    label.Text = "Entre na sua conta Blox AI"
    label.TextColor3 = Color3.fromRGB(148, 163, 184) 
    label.Font = Enum.Font.Gotham
    label.TextSize = 14
    label.TextWrapped = true
    label.Parent = self.ContentContainer

    local emailInput = Instance.new("TextBox")
    emailInput.Size = UDim2.new(1, -40, 0, 40)
    emailInput.Position = UDim2.new(0, 20, 0, 60)
    emailInput.BackgroundColor3 = Color3.fromRGB(30, 41, 59) 
    emailInput.TextColor3 = Color3.fromRGB(248, 250, 252)
    emailInput.PlaceholderText = "E-mail"
    emailInput.Font = Enum.Font.Gotham
    emailInput.TextSize = 14
    emailInput.ClearTextOnFocus = false
    local corner1 = Instance.new("UICorner")
    corner1.CornerRadius = UDim.new(0, 6)
    corner1.Parent = emailInput
    emailInput.Parent = self.ContentContainer

    local passInput = Instance.new("TextBox")
    passInput.Size = UDim2.new(1, -40, 0, 40)
    passInput.Position = UDim2.new(0, 20, 0, 110)
    passInput.BackgroundColor3 = Color3.fromRGB(30, 41, 59) 
    passInput.TextColor3 = Color3.fromRGB(248, 250, 252)
    passInput.PlaceholderText = "Senha"
    passInput.Font = Enum.Font.Gotham
    passInput.TextSize = 14
    passInput.ClearTextOnFocus = false
    -- O Roblox nativo n tem field "type=password", pra mvp deixamos normal ou censurado via script, 
    -- mas por simplicidade e limite de API deixamos normal.
    local corner2 = Instance.new("UICorner")
    corner2.CornerRadius = UDim.new(0, 6)
    corner2.Parent = passInput
    passInput.Parent = self.ContentContainer

    local errorLabel = Instance.new("TextLabel")
    errorLabel.Size = UDim2.new(1, -40, 0, 20)
    errorLabel.Position = UDim2.new(0, 20, 0, 155)
    errorLabel.BackgroundTransparency = 1
    errorLabel.Text = ""
    errorLabel.TextColor3 = Color3.fromRGB(248, 113, 113) 
    errorLabel.Font = Enum.Font.Gotham
    errorLabel.TextSize = 12
    errorLabel.Parent = self.ContentContainer

    local btn = Instance.new("TextButton")
    btn.Size = UDim2.new(1, -40, 0, 40)
    btn.Position = UDim2.new(0, 20, 0, 180)
    btn.BackgroundColor3 = Color3.fromRGB(37, 99, 235) 
    btn.TextColor3 = Color3.new(1, 1, 1)
    btn.Text = "Login"
    btn.Font = Enum.Font.GothamBold
    btn.TextSize = 14
    local btnCorner = Instance.new("UICorner")
    btnCorner.CornerRadius = UDim.new(0, 6)
    btnCorner.Parent = btn
    btn.Parent = self.ContentContainer

    btn.MouseButton1Click:Connect(function()
        if emailInput.Text ~= "" and passInput.Text ~= "" then
            btn.Text = "Conectando..."
            errorLabel.Text = ""
            local success, msg = AuthManager:Login(emailInput.Text, passInput.Text)
            if not success then
                btn.Text = "Login"
                errorLabel.Text = msg
            end
        end
    end)
end

function UI:RenderDashboardScreen(projectName)
    self.ContentContainer:ClearAllChildren()

    local status = Instance.new("TextLabel")
    status.Size = UDim2.new(1, -40, 0, 80)
    status.Position = UDim2.new(0, 20, 0, 20)
    status.BackgroundTransparency = 1
    status.Text = "🟢 Conectado!\nProjeto: " .. (projectName or "Auto") .. "\n\nAguardando comandos da Web..."
    status.TextColor3 = Color3.fromRGB(74, 222, 128) 
    status.Font = Enum.Font.GothamBold
    status.TextSize = 14
    status.TextWrapped = true
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
