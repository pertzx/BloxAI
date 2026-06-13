/**
 * Blox AI - Auth Controller Extended
 * Forgot/Reset password, etc
 */

const crypto = require('crypto');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');

exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) {
            // Don't reveal if email exists
            return res.json({
                status: 'success',
                message: 'Se o email existir, você receberá um link de recuperação.'
            });
        }
        
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');
        
        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save({ validateBeforeSave: false });
        
        // Send email
        const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
        await sendEmail({
            to: user.email,
            subject: '🔐 Recuperação de Senha - Blox AI',
            html: `
                <h2>Olá, ${user.profile?.firstName || 'Usuário'}!</h2>
                <p>Você solicitou a recuperação de senha.</p>
                <p>Clique no link abaixo para redefinir sua senha:</p>
                <a href="${resetURL}" style="background: #5b8def; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                    Redefinir Senha
                </a>
                <p>Este link expira em 10 minutos.</p>
                <p>Se você não solicitou isso, ignore este email.</p>
            `
        });
        
        res.json({
            status: 'success',
            message: 'Se o email existir, você receberá um link de recuperação.'
        });
    } catch (error) {
        next(error);
    }
};

exports.resetPassword = async (req, res, next) => {
    try {
        const { token, password } = req.body;
        
        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');
        
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
        });
        
        if (!user) {
            return res.status(400).json({
                status: 'error',
                message: 'Token inválido ou expirado.'
            });
        }
        
        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        user.passwordChangedAt = Date.now();
        
        await user.save();
        
        // Invalidate all refresh tokens
        user.refreshTokens = [];
        await user.save({ validateBeforeSave: false });
        
        res.json({
            status: 'success',
            message: 'Senha redefinida com sucesso.'
        });
    } catch (error) {
        next(error);
    }
};

exports.changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        const user = await User.findById(req.user._id).select('+password');
        
        if (!(await user.comparePassword(currentPassword))) {
            return res.status(401).json({
                status: 'error',
                message: 'Senha atual incorreta.'
            });
        }
        
        user.password = newPassword;
        user.passwordChangedAt = Date.now();
        await user.save();
        
        res.json({
            status: 'success',
            message: 'Senha alterada com sucesso.'
        });
    } catch (error) {
        next(error);
    }
};
