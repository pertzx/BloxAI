/**
 * Blox AI - Email Service
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const sendEmail = async ({ to, subject, html, text }) => {
    try {
        if (!process.env.SMTP_USER) {
            console.log('[Email - DEV MODE]', { to, subject });
            return { dev: true };
        }
        
        const info = await transporter.sendMail({
            from: `"Blox AI" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text: text || subject,
            html
        });
        
        console.log('[Email sent]', info.messageId);
        return info;
    } catch (error) {
        console.error('[Email error]', error);
        throw error;
    }
};

module.exports = { sendEmail };
