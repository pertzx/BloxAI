import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  JWT_SECRET,
  ROBLOX_OAUTH_CLIENT_ID,
  ROBLOX_OAUTH_CLIENT_SECRET,
  ROBLOX_REDIRECT_URI,
  FRONTEND_URL,
  ADMIN_ROBLOX_IDS,
  SIGNUP_BONUS_BALANCE_USD,
} from '../config/env.js';
import { User } from '../models/User.js';
import { EmailService } from '../services/EmailService.js';
import { PlanService } from '../services/PlanService.js';

// ── Constantes Roblox OAuth ────────────────────────────────────────────────────
const ROBLOX_AUTH_URL = 'https://apis.roblox.com/oauth/v1/authorize';
const ROBLOX_TOKEN_URL = 'https://apis.roblox.com/oauth/v1/token';
const ROBLOX_USERINFO_URL = 'https://apis.roblox.com/oauth/v1/userinfo';
const ROBLOX_SCOPES = 'openid profile';

// ── Helpers ────────────────────────────────────────────────────────────────────

function issueJwt(user) {
  return jwt.sign(
    {
      id: String(user._id),
      robloxId: user.robloxId,
      username: user.robloxUsername,
      role: user.role,
      planType: user.planType,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function randomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── 1. Iniciar fluxo OAuth ─────────────────────────────────────────────────────

export const robloxOAuthStart = (req, res) => {
  if (!ROBLOX_OAUTH_CLIENT_ID) {
    return res.status(503).json({ error: 'Roblox OAuth não está configurado no servidor.' });
  }

  // state assinado com JWT para prevenir CSRF
  const state = jwt.sign({ nonce: randomHex(16) }, JWT_SECRET, { expiresIn: '10m' });

  const params = new URLSearchParams({
    client_id: ROBLOX_OAUTH_CLIENT_ID,
    redirect_uri: ROBLOX_REDIRECT_URI,
    response_type: 'code',
    scope: ROBLOX_SCOPES,
    state,
  });

  res.redirect(`${ROBLOX_AUTH_URL}?${params.toString()}`);
};

// ── 2. Callback OAuth ──────────────────────────────────────────────────────────

export const robloxOAuthCallback = async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  // Erro retornado pela Roblox (ex: usuário cancelou)
  if (oauthError) {
    return res.redirect(`${FRONTEND_URL}/login?error=cancelled`);
  }

  // Verificar CSRF state
  try {
    jwt.verify(String(state || ''), JWT_SECRET);
  } catch {
    return res.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
  }

  try {
    // Trocar code por access_token
    const tokenRes = await fetch(ROBLOX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: ROBLOX_OAUTH_CLIENT_ID,
        client_secret: ROBLOX_OAUTH_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: ROBLOX_REDIRECT_URI,
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error('[auth/roblox] Falha ao trocar code:', await tokenRes.text());
      return res.redirect(`${FRONTEND_URL}/login?error=token_exchange`);
    }

    const { access_token } = await tokenRes.json();

    // Buscar dados do usuário Roblox
    const userInfoRes = await fetch(ROBLOX_USERINFO_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userInfoRes.ok) {
      return res.redirect(`${FRONTEND_URL}/login?error=userinfo`);
    }

    const info = await userInfoRes.json();
    // info.sub = roblox user ID (string)
    // info.preferred_username = @username
    // info.name = display name
    // info.picture = avatar URL
    const robloxId = String(info.sub);
    const robloxUsername = String(info.preferred_username || info.name || robloxId);
    const robloxDisplayName = String(info.name || robloxUsername);
    const robloxAvatarUrl = String(info.picture || '');

    // Verificar se é admin por robloxId
    const isAdmin = ADMIN_ROBLOX_IDS.includes(robloxId);
    const bonus = Number(SIGNUP_BONUS_BALANCE_USD) || 0;

    // Upsert: cria usuário na primeira vez, atualiza dados Roblox nas seguintes
    let isNewUser = false;
    let user = await User.findOne({ robloxId });

    if (!user) {
      isNewUser = true;
      user = await User.create({
        robloxId,
        robloxUsername,
        robloxDisplayName,
        robloxAvatarUrl,
        role: isAdmin ? 'admin' : 'user',
        balanceUsd: bonus,
        walletStartUsd: bonus,
      });
    } else {
      // Atualiza username/avatar caso tenha mudado
      user.robloxUsername = robloxUsername;
      user.robloxDisplayName = robloxDisplayName;
      user.robloxAvatarUrl = robloxAvatarUrl;
      if (isAdmin && user.role !== 'admin') user.role = 'admin';
      await user.save();
    }

    const token = issueJwt(user);
    const redirectUrl = new URL(`${FRONTEND_URL}/auth/callback`);
    redirectUrl.searchParams.set('token', token);
    if (isNewUser) redirectUrl.searchParams.set('new', '1');

    res.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('[auth/roblox/callback]', err);
    res.redirect(`${FRONTEND_URL}/login?error=server`);
  }
};

// ── 3. Perfil autenticado ─────────────────────────────────────────────────────

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const plan = PlanService.resolveForUser(user);
    const isAdmin = user.role === 'admin';
    const features = {
      ideaGenerator: isAdmin || Boolean(plan?.features?.ideaGenerator),
      thinkMode: isAdmin || Boolean(plan?.features?.thinkMode),
      prioritySupport: isAdmin || Boolean(plan?.features?.prioritySupport),
    };

    res.json({
      id: String(user._id),
      robloxId: user.robloxId,
      robloxUsername: user.robloxUsername,
      robloxDisplayName: user.robloxDisplayName,
      robloxAvatarUrl: user.robloxAvatarUrl,
      role: user.role,
      planType: user.planType,
      plan: user.plan,
      planKey: plan?.key || user.planKey || null,
      features,
      status: user.status,
      balanceUsd: user.balanceUsd,
      securityEmail: user.securityEmail || null,
      securityEmailVerified: user.securityEmailVerified,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro interno.' });
  }
};

// ── 4. Adicionar / atualizar e-mail de segurança ──────────────────────────────

export const setSecurityEmail = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }

    // Verifica se o e-mail já está em uso por outra conta
    const conflict = await User.findOne({ securityEmail: email.toLowerCase() });
    if (conflict && String(conflict._id) !== String(req.user.id)) {
      return res.status(409).json({ error: 'Este e-mail já está vinculado a outra conta.' });
    }

    const rawToken = randomHex();
    const hashedToken = hashToken(rawToken);
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await User.findByIdAndUpdate(req.user.id, {
      securityEmail: email.toLowerCase(),
      securityEmailVerified: false,
      securityEmailToken: hashedToken,
      securityEmailTokenExpires: expires,
    });

    const send = await EmailService.sendVerification({ to: email, token: rawToken });

    if (send) console.log(send)

    res.json({ success: true, message: 'E-mail de verificação enviado.' });
  } catch (err) {
    console.error('[auth/security-email]', err);
    res.status(500).json({ error: 'Erro ao salvar e-mail de segurança.' });
  }
};

// ── 5. Verificar e-mail de segurança (link do e-mail) ─────────────────────────

export const verifySecurityEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.redirect(`${FRONTEND_URL}/settings?emailVerified=error`);

    const hashed = hashToken(String(token));
    const user = await User.findOne({
      securityEmailToken: hashed,
      securityEmailTokenExpires: { $gt: new Date() },
    }).select('+securityEmailToken');

    if (!user) return res.redirect(`${FRONTEND_URL}/settings?emailVerified=expired`);

    user.securityEmailVerified = true;
    user.securityEmailToken = null;
    user.securityEmailTokenExpires = null;
    await user.save();

    res.redirect(`${FRONTEND_URL}/settings?emailVerified=ok`);
  } catch (err) {
    console.error('[auth/verify-email]', err);
    res.redirect(`${FRONTEND_URL}/settings?emailVerified=error`);
  }
};

// ── 6. Solicitar recuperação de conta ─────────────────────────────────────────

export const requestRecovery = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'E-mail obrigatório.' });

    // Sempre retorna 200 para não expor se o e-mail existe (anti-enumeração)
    const user = await User.findOne({
      securityEmail: email.toLowerCase(),
      securityEmailVerified: true,
    }).select('+recoveryToken');

    if (user) {
      const rawToken = randomHex();
      const hashedToken = hashToken(rawToken);
      const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

      user.recoveryToken = hashedToken;
      user.recoveryTokenExpires = expires;
      await user.save();

      await EmailService.sendRecovery({
        to: email,
        token: rawToken,
        robloxUsername: user.robloxUsername,
      });
    }

    res.json({ success: true, message: 'Se este e-mail estiver cadastrado, você receberá um link em instantes.' });
  } catch (err) {
    console.error('[auth/recover]', err);
    res.status(500).json({ error: 'Erro ao processar recuperação.' });
  }
};

// ── 7. Confirmar recuperação (link do e-mail) ──────────────────────────────────

export const confirmRecovery = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.redirect(`${FRONTEND_URL}/login?error=invalid_recovery`);

    const hashed = hashToken(String(token));
    const user = await User.findOne({
      recoveryToken: hashed,
      recoveryTokenExpires: { $gt: new Date() },
    }).select('+recoveryToken');

    if (!user) return res.redirect(`${FRONTEND_URL}/login?error=recovery_expired`);

    // Invalida o token após uso (one-time)
    user.recoveryToken = null;
    user.recoveryTokenExpires = null;
    await user.save();

    const jwtToken = issueJwt(user);
    const redirectUrl = new URL(`${FRONTEND_URL}/auth/callback`);
    redirectUrl.searchParams.set('token', jwtToken);
    redirectUrl.searchParams.set('recovered', '1');

    res.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('[auth/recover/confirm]', err);
    res.redirect(`${FRONTEND_URL}/login?error=server`);
  }
};
