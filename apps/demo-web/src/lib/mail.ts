/**
 * Outbound mail for the demo contact form.
 *
 * Self-hosters configure SIWD_CONTACT_TO + optional SMTP_* env vars.
 * When SMTP is not configured, messages are logged to the server console
 * so local demos still exercise the form without a real mail server.
 */
import nodemailer from "nodemailer";
import {
  CONTACT_FROM,
  CONTACT_TO,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
} from "./config.js";

export type ContactMailInput = {
  replyTo: string;
  subject: string;
  message: string;
  dashName: string;
  identityId: string;
  accountId: number;
  saveEmailRequested: boolean;
};

export type ContactMailResult =
  | { ok: true; transport: "smtp" | "log" }
  | { ok: false; message: string };

function buildBody(input: ContactMailInput): string {
  return [
    "Sign in with Dash — contact form submission",
    "",
    `From (reply-to): ${input.replyTo}`,
    `Dash name: ${input.dashName}`,
    `Identity ID: ${input.identityId}`,
    `Account id: ${input.accountId}`,
    `Save email on account requested: ${input.saveEmailRequested ? "yes" : "no"}`,
    "",
    "Message:",
    input.message,
    "",
  ].join("\n");
}

export async function sendContactMail(
  input: ContactMailInput,
): Promise<ContactMailResult> {
  if (!CONTACT_TO) {
    return {
      ok: false,
      message: "Contact form is not configured on this deployment.",
    };
  }

  const subject =
    input.subject.trim() ||
    `SIWD contact from ${input.dashName}`;
  const text = buildBody(input);
  const from =
    CONTACT_FROM ||
    SMTP_USER ||
    `siwd-demo@${SMTP_HOST || "localhost"}`;

  if (!SMTP_HOST) {
    // Dev / misconfigured host: do not fail the form; log for operators.
    console.log(
      "[siwd-contact] SMTP not configured; logging submission instead\n" +
        `To: ${CONTACT_TO}\nFrom: ${from}\nReply-To: ${input.replyTo}\n` +
        `Subject: ${subject}\n\n${text}`,
    );
    return { ok: true, transport: "log" };
  }

  try {
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth:
        SMTP_USER || SMTP_PASS
          ? { user: SMTP_USER, pass: SMTP_PASS }
          : undefined,
    });

    await transport.sendMail({
      from,
      to: CONTACT_TO,
      replyTo: input.replyTo,
      subject: subject.slice(0, 200),
      text,
    });
    return { ok: true, transport: "smtp" };
  } catch (e) {
    console.error("[siwd-contact] send failed", e);
    return {
      ok: false,
      message:
        e instanceof Error
          ? `Could not send message: ${e.message}`
          : "Could not send message.",
    };
  }
}
