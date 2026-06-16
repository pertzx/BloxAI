import nodemailer from 'nodemailer';
import EmailQueue from '../models/EmailQueue.js';
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, FRONTEND_URL } from '../config/env.js';

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS = [60, 300, 900, 3600, 7200];

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transporter;
}

async function sendDirect({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.log('\n──────────────────────────────────────────');
    console.log(`[EmailService DEV] Para: ${to}`);
    console.log(`[EmailService DEV] Assunto: ${subject}`);
    console.log(`[EmailService DEV] Conteúdo: ${html.replace(/<[^>]+>/g, '')}`);
    console.log('──────────────────────────────────────────\n');
    return;
  }
  const info = await t.sendMail({ from: EMAIL_FROM, to, subject, html });
  console.log(`[EmailService] E-mail enviado para ${to} (${info.messageId})`);
}

async function enqueue({ to, subject, html }) {
  if (!getTransporter()) {
    await sendDirect({ to, subject, html });
    return;
  }

  try {
    await sendDirect({ to, subject, html });
    try {
      await EmailQueue.create({ to, subject, html, status: 'sent', attempts: 1 });
    } catch {
      // Falha ao registrar no log — não é crítico
    }
  } catch (err) {
    console.error(`[EmailService] Envio direto falhou para ${to}:`, err.message);
    try {
      const nextRetry = new Date(Date.now() + RETRY_DELAYS[0] * 1000);
      await EmailQueue.create({ to, subject, html, status: 'pending', attempts: 1, lastError: err.message, nextRetryAt: nextRetry });
      console.log(`[EmailService] E-mail enfileirado para retry (próxima tentativa em ${RETRY_DELAYS[0]}s)`);
    } catch (queueErr) {
      console.error('[EmailService] CRÍTICO — falha ao enfileirar e-mail:', queueErr.message);
    }
  }
}

export async function processEmailQueue() {
  const now = new Date();
  const pending = await EmailQueue.find({
    status: 'pending',
    nextRetryAt: { $lte: now },
  }).sort({ nextRetryAt: 1 }).limit(10);

  for (const job of pending) {
    try {
      await sendDirect({ to: job.to, subject: job.subject, html: job.html });
      job.status = 'sent';
      job.attempts += 1;
      await job.save();
    } catch (err) {
      job.attempts += 1;
      job.lastError = err.message;
      if (job.attempts >= MAX_ATTEMPTS) {
        job.status = 'failed';
      } else {
        const delay = RETRY_DELAYS[Math.min(job.attempts - 1, RETRY_DELAYS.length - 1)];
        job.nextRetryAt = new Date(Date.now() + delay * 1000);
      }
      await job.save();
      console.error(`[EmailQueue] Tentativa ${job.attempts}/${MAX_ATTEMPTS} falhou para ${job.to}:`, err.message);
    }
  }

  return pending.length;
}

let queueInterval = null;
export function startEmailQueueWorker(intervalMs = 60_000) {
  if (queueInterval) return;
  queueInterval = setInterval(async () => {
    try {
      const processed = await processEmailQueue();
      if (processed > 0) console.log(`[EmailQueue] Processou ${processed} e-mail(s) da fila`);
    } catch (err) {
      console.error('[EmailQueue] Erro no worker:', err.message);
    }
  }, intervalMs);
  console.log(`[EmailQueue] Worker iniciado (intervalo: ${intervalMs / 1000}s)`);
}

export const EmailService = {
  async sendVerification({ to, token }) {
    const link = `${FRONTEND_URL}/auth/verify-email?token=${token}`;
    console.log(`[EmailService] Enviando verificação para ${to}...`);
    await enqueue({
      to,
      subject: 'Blox AI — Verificar e-mail de segurança',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#e2e8f0;background:#141720;border-radius:16px;padding:32px;border:1px solid rgba(255,255,255,0.08)">
          <h2 style="color:#fff;margin-top:0">Verificar e-mail de segurança</h2>
          <p>Clique no botão abaixo para vincular este e-mail à sua conta Blox AI.</p>
          <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#4785FF,#8C46FF);color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;margin:16px 0">
            Verificar e-mail
          </a>
          <p style="color:#64748b;font-size:13px">O link expira em <strong>1 hora</strong>.<br>Se não foi você, ignore este e-mail.</p>
        </div>
      `,
    });
  },

  async sendRecovery({ to, token, robloxUsername }) {
    const link = `${FRONTEND_URL}/auth/recover?token=${token}`;
    console.log(`[EmailService] Enviando recuperação para ${to}...`);
    await enqueue({
      to,
      subject: 'Blox AI — Link de recuperação de conta',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#e2e8f0;background:#141720;border-radius:16px;padding:32px;border:1px solid rgba(255,255,255,0.08)">
          <h2 style="color:#fff;margin-top:0">Recuperar conta Blox AI</h2>
          <p>Recebemos um pedido de recuperação para a conta vinculada a <strong style="color:#7eb3ff">@${robloxUsername}</strong>.</p>
          <p>Clique no botão abaixo para acessar sua conta sem precisar do Roblox:</p>
          <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#4785FF,#8C46FF);color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;margin:16px 0">
            Recuperar minha conta
          </a>
          <p style="color:#64748b;font-size:13px">O link expira em <strong>15 minutos</strong> e é de uso único.<br>Se não foi você, ignore este e-mail.</p>
        </div>
      `,
    });
  },
};
