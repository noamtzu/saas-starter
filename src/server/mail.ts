import nodemailer from "nodemailer";

/**
 * Transactional email. With EMAIL_SERVER unset (local development, CI) the
 * message is logged instead; the invite link is also shown in the UI.
 */
export async function sendInvitationEmail({ to, link }: { to: string; link: string }) {
  const server = process.env.EMAIL_SERVER;
  const subject = "You have been invited to an organisation";
  const text = `You have been invited to join an organisation on SaaS Starter.\n\nAccept the invitation: ${link}\n\nThe link expires in 7 days.`;

  if (!server) {
    console.info(`[mail] To: ${to}\n${subject}\n${link}`);
    return;
  }
  await nodemailer.createTransport(server).sendMail({
    to,
    from: process.env.EMAIL_FROM ?? "SaaS Starter <no-reply@example.com>",
    subject,
    text,
  });
}
