const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { promisify } = require('util');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  });
};

const signRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
};

const createSendTokens = async (user, statusCode, res) => {
  const accessToken = signToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  user.refreshTokens.push({
    token: refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });

  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }

  await user.save({ validateBeforeSave: false });

  // Set HTTP-only cookies so subsequent SSR page renders (e.g. /dashboard)
  // can be authenticated without needing the Authorization header.
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('blox_access_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000
  });
  res.cookie('blox_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    accessToken,
    refreshToken,
    data: { user }
  });
};

exports.register = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    console.log(`[DEBUG][REGISTER] email="${email}" pwLen=${password ? password.length : 0} firstName="${firstName || ''}"`);

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log(`[DEBUG][REGISTER] email already in use: "${email}"`);
      return res.status(409).json({
        status: 'error',
        message: 'Email já está em uso.'
      });
    }

    const newUser = await User.create({
      email,
      password,
      profile: { firstName, lastName }
    });
    console.log(`[DEBUG][REGISTER] user created _id=${newUser._id}`);

    await createSendTokens(newUser, 201, res);
    console.log(`[DEBUG][REGISTER] SUCCESS _id=${newUser._id}`);
  } catch (error) {
    console.error('[DEBUG][REGISTER] EXCEPTION:', error.message, error.stack);
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    console.log(`[DEBUG][LOGIN] email="${email}" pwLen=${password ? password.length : 0} ip=${req.ip} ua=${(req.headers['user-agent'] || '').slice(0, 40)}`);

    if (!email || !password) {
      console.log('[DEBUG][LOGIN] missing email or password');
      return res.status(400).json({
        status: 'error',
        message: 'Por favor forneça email e senha.'
      });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.log(`[DEBUG][LOGIN] user not found for email="${email}"`);
      return res.status(401).json({
        status: 'error',
        message: 'Email ou senha incorretos.'
      });
    }
    console.log(`[DEBUG][LOGIN] user found _id=${user._id} isActive=${user.isActive}`);

    const passOk = await user.comparePassword(password);
    console.log(`[DEBUG][LOGIN] comparePassword -> ${passOk}`);
    if (!passOk) {
      return res.status(401).json({
        status: 'error',
        message: 'Email ou senha incorretos.'
      });
    }

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    await createSendTokens(user, 200, res);
    console.log(`[DEBUG][LOGIN] SUCCESS _id=${user._id} tokenIssued=true`);
  } catch (error) {
    console.error('[DEBUG][LOGIN] EXCEPTION:', error.message, error.stack);
    next(error);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        status: 'error',
        message: 'Refresh token não fornecido.'
      });
    }
    
    const decoded = await promisify(jwt.verify)(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Usuário não encontrado.'
      });
    }
    
    const tokenExists = user.refreshTokens.some(t => t.token === refreshToken);
    if (!tokenExists) {
      return res.status(401).json({
        status: 'error',
        message: 'Token inválido. Por favor faça login novamente.'
      });
    }
    
    const newAccessToken = signToken(user._id);
    const newRefreshToken = signRefreshToken(user._id);
    
    user.refreshTokens = user.refreshTokens.filter(t => t.token !== refreshToken);
    user.refreshTokens.push({
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    
    await user.save({ validateBeforeSave: false });
    
    res.status(200).json({
      status: 'success',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const user = req.user;

    if (refreshToken) {
      user.refreshTokens = user.refreshTokens.filter(t => t.token !== refreshToken);
      await user.save({ validateBeforeSave: false });
    }

    res.clearCookie('blox_access_token');
    res.clearCookie('blox_refresh_token');

    res.status(200).json({
      status: 'success',
      message: 'Logout realizado com sucesso.'
    });
  } catch (error) {
    next(error);
  }
};

exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('subscription')
      .populate('projects', 'name updatedAt');
    
    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

exports.generateApiKey = async (req, res, next) => {
  try {
    const crypto = require('crypto');
    const apiKey = `blox_${crypto.randomBytes(32).toString('hex')}`;
    
    const user = await User.findById(req.user._id);
    user.apiKey = apiKey;
    await user.save({ validateBeforeSave: false });
    
    res.status(200).json({
      status: 'success',
      apiKey,
      message: 'Guarde esta chave em local seguro. Ela não será mostrada novamente.'
    });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, language, codeStyle, theme } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (firstName !== undefined) user.profile.firstName = firstName;
    if (lastName !== undefined) user.profile.lastName = lastName;
    if (language !== undefined) user.preferences.language = language;
    if (codeStyle !== undefined) user.preferences.codeStyle = codeStyle;
    if (theme !== undefined) user.preferences.theme = theme;
    
    await user.save({ validateBeforeSave: false });
    
    res.status(200).json({
      status: 'success',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};
