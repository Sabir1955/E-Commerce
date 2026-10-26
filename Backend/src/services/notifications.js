const nodemailer = require("nodemailer");
const twilio = require("twilio");

async function email(to, subject, text, html) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return { sent: false, reason: "SMTP not configured in .env" };
  }
  try {
    const isGmail = process.env.SMTP_HOST.includes("gmail");
    const transportOptions = isGmail
      ? {
          service: "gmail",
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        }
      : {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        };

    const transporter = nodemailer.createTransport(transportOptions);
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html: html || `<p>${text}</p>`
    });
    return { sent: true };
  } catch (error) {
    console.error("[SMTP EMAIL ERROR]:", error.message);
    return { sent: false, reason: error.message };
  }
}
async function message(to, body, channel) {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !process.env.TWILIO_FROM_PHONE) return { sent: false, reason: "Twilio is not configured" };
  const client = twilio(sid, token);
  const from = channel === "whatsapp" ? `whatsapp:${process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_FROM_PHONE}` : process.env.TWILIO_FROM_PHONE;
  const destination = channel === "whatsapp" ? `whatsapp:${to}` : to;
  await client.messages.create({ from, to: destination, body });
  return { sent: true };
}
module.exports = { email, sms: (to, body) => message(to, body, "sms"), whatsapp: (to, body) => message(to, body, "whatsapp") };
