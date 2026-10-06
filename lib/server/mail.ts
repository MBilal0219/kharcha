import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/** Where links in emails point. Never derived from the request, so a forged Host header can't redirect a reset link. */
export function appUrl(): string {
  const explicit = process.env.AUTH_URL;
  if (explicit) return new URL(explicit).origin;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.NODE_ENV !== "production") return `http://localhost:${process.env.PORT ?? 3000}`;
  throw new Error("AUTH_URL is not set");
}

let transport: Transporter | null = null;
function smtp(): Transporter {
  const port = Number(process.env.SMTP_PORT ?? 587);
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 587 starts plain and must upgrade to TLS before signing in
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

/** Sends over SMTP. Without SMTP_HOST, development prints the email to the server console. */
export async function sendMail(mail: { to: string; subject: string; text: string }) {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP_HOST is not set");
    console.log(`\n--- email to ${mail.to} ---\n${mail.subject}\n\n${mail.text}\n---\n`);
    return;
  }
  const address = process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? "";
  await smtp().sendMail({ from: { name: process.env.SMTP_FROM_NAME ?? "Kharcha", address }, ...mail });
}
