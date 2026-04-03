/**
 * Email sending service.
 *
 * Development mode: logs emails via pino (ConsoleEmailProvider).
 * Production: swap in SendGrid/Resend/SES provider via EMAIL_PROVIDER env var.
 *
 * Email failures must NEVER block the calling operation — all errors are caught and logged.
 */

import { logger } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface IEmailProvider {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailProvider implements IEmailProvider {
  async send(message: EmailMessage): Promise<void> {
    logger.info(
      {
        emailTo: message.to,
        emailSubject: message.subject,
        emailTextPreview: message.text.substring(0, 300),
      },
      "EMAIL_SENT (dev mode — not actually delivered)",
    );
  }
}

let provider: IEmailProvider | null = null;

function getProvider(): IEmailProvider {
  if (!provider) {
    // Future: check process.env.EMAIL_PROVIDER and EMAIL_API_KEY
    // to instantiate SendGrid, Resend, or AWS SES provider.
    provider = new ConsoleEmailProvider();
  }
  return provider;
}

/**
 * Send an email. Errors are caught and logged — never thrown.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  try {
    await getProvider().send(message);
  } catch (err) {
    logger.error({ err, to: message.to, subject: message.subject }, "Failed to send email");
  }
}
