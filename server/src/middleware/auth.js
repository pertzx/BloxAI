const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  try {
    let token = null;
    
    // Método 1: Authorization header (Web normal)
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // Método 2: Token no body (Roblox plugin não permite custom headers)
    if (!token && req.body && req.body._token) {
      token = req.body._token;
      // Remove do body para não poluir
      delete req.body._token;
    }
    
    // Método 3: Cookie
    if (!token && req.cookies?.blox_access_token) {
      token = req.cookies.blox_access_token;
    }
    
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Não autorizado. Por favor faça login.'
      });
    }
    
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Usuário não encontrado.'
      });
    }
    
    if (user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        status: 'error',
        message: 'Senha alterada. Por favor faça login novamente.'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'Você não tem permissão para realizar esta ação.'
      });
    }
    next();
  };
};
