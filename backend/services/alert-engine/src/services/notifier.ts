import axios from 'axios';
import nodemailer from 'nodemailer';
import config from '../config';
import { Logger } from '../config/logger';

const logger = new Logger('Notifier');

export interface AlertNotification {
  ruleName: string;
  host: string;
  severity: string;
  message: string;
  status: 'firing' | 'resolved';
  value: number;
  threshold: number;
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
};

export async function sendSlack(n: AlertNotification): Promise<void> {
  const url = config.notifications.slackWebhookUrl;
  if (!url) return;

  const emoji = n.status === 'firing' ? (SEVERITY_EMOJI[n.severity] ?? '⚠️') : '✅';
  const color = n.status === 'firing'
    ? (n.severity === 'critical' ? '#FF0000' : n.severity === 'high' ? '#FF6600' : '#FFCC00')
    : '#36A64F';

  const payload = {
    attachments: [{
      color,
      title: `${emoji} Alert ${n.status.toUpperCase()}: ${n.ruleName}`,
      text: n.message,
      fields: [
        { title: 'Host',      value: n.host,              short: true },
        { title: 'Severity',  value: n.severity,          short: true },
        { title: 'Value',     value: String(n.value),     short: true },
        { title: 'Threshold', value: String(n.threshold), short: true },
      ],
      footer: 'IT Watch Tower',
      ts: Math.floor(Date.now() / 1000),
    }],
  };

  try {
    await axios.post(url, payload, { timeout: 5000 });
  } catch (err) {
    logger.error('Slack notification failed', err as Error);
  }
}

export async function sendEmail(to: string, n: AlertNotification): Promise<void> {
  const cfg = config.notifications;
  if (!cfg.smtpHost || !to) return;

  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  });

  const emoji = n.status === 'firing' ? '🚨' : '✅';
  const subject = `${emoji} [IT Watch Tower] ${n.status.toUpperCase()}: ${n.ruleName} on ${n.host}`;
  const html = `
    <h2>${subject}</h2>
    <p><b>Host:</b> ${n.host}</p>
    <p><b>Rule:</b> ${n.ruleName}</p>
    <p><b>Severity:</b> ${n.severity}</p>
    <p><b>Message:</b> ${n.message}</p>
    <p><b>Value:</b> ${n.value} (threshold: ${n.threshold})</p>
    <p><b>Time:</b> ${new Date().toISOString()}</p>
    <hr><small>IT Watch Tower Alert Engine</small>
  `;

  try {
    await transporter.sendMail({ from: cfg.smtpFrom || cfg.smtpUser, to, subject, html });
  } catch (err) {
    logger.error(`Email notification to ${to} failed`, err as Error);
  }
}

export async function notify(n: AlertNotification, notifySlack: boolean, notifyEmail: string): Promise<void> {
  const promises: Promise<void>[] = [];
  if (notifySlack) promises.push(sendSlack(n));
  if (notifyEmail) {
    for (const email of notifyEmail.split(',').map((e) => e.trim()).filter(Boolean)) {
      promises.push(sendEmail(email, n));
    }
  }
  await Promise.allSettled(promises);
}
