---
name: project-roblox-oauth
description: Auth system migrated from email/password to Roblox OAuth — no passwords stored
metadata:
  type: project
---

Auth is exclusively Roblox OAuth 2.0. No email/password anywhere.

**Why:** User requested all auth via Roblox identity; security email is optional backup only for account recovery.

**How to apply:**
- User model has `robloxId` (required, unique), `robloxUsername`, `robloxDisplayName`, `robloxAvatarUrl`
- `securityEmail` is optional, only used for magic-link recovery (not for login)
- Plugin auth uses `apiKey + placeId` (not email/password) — copy apiKey from project in web dashboard
- JWT payload: `{ id, robloxId, username (=robloxUsername), role, planType }`
- OAuth flow: GET /api/auth/roblox → Roblox → GET /api/auth/roblox/callback → frontend /auth/callback?token=JWT
- Recovery flow: POST /api/auth/recover (by securityEmail) → magic link → GET /api/auth/recover/confirm → /auth/callback?token=JWT&recovered=1
- New user redirect: /settings?welcome=1 to prompt adding security email
- `ADMIN_ROBLOX_IDS` env var replaces `ADMIN_EMAILS` for admin role assignment
- Email sending: Resend REST API if `RESEND_API_KEY` set; console.log in dev
