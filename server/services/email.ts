import sgMail from "@sendgrid/mail";
import { storage } from "../storage";
import { decryptPassword } from "../encryption";

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    type?: string;
  }>;
}

export class EmailNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailNotConfiguredError";
  }
}

async function loadConfig(): Promise<{ apiKey: string; fromEmail: string; fromName: string }> {
  const cfg = await storage.getAppSettings();
  if (!cfg.emailEnabled) throw new EmailNotConfiguredError("Email delivery is disabled");
  if (!cfg.sendgridApiKey) throw new EmailNotConfiguredError("SendGrid API key is not configured");
  if (!cfg.fromEmail) throw new EmailNotConfiguredError("From email is not configured");

  const apiKey = await decryptPassword(cfg.sendgridApiKey);
  return {
    apiKey,
    fromEmail: cfg.fromEmail,
    fromName: cfg.fromName || cfg.fromEmail,
  };
}

export async function sendMail(params: SendMailParams): Promise<void> {
  const { apiKey, fromEmail, fromName } = await loadConfig();
  sgMail.setApiKey(apiKey);

  await sgMail.send({
    to: params.to,
    from: { email: fromEmail, name: fromName },
    subject: params.subject,
    html: params.html,
    text: params.text ?? stripHtml(params.html),
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content).toString("base64"),
      type: a.type ?? "text/csv",
      disposition: "attachment",
    })),
  });
}

function stripHtml(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
