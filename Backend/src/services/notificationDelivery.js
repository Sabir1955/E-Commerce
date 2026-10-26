const NotificationLog = require("../models/NotificationLog");
const gateway = require("./notifications");

async function deliver(channel, recipient, message, subject, metadata = {}, html = null) {
  let result;
  let status = "failed";
  try {
    if (!recipient) {
      result = { sent: false, reason: "Recipient is missing" };
      status = "skipped";
    } else {
      result = channel === "email"
        ? await gateway.email(recipient, subject, message, html)
        : await gateway[channel](recipient, message);
      status = result.sent ? "sent" : "skipped";
    }
  } catch (error) {
    result = { sent: false, reason: error.message || "Delivery failed" };
  }
  if (!metadata.skipLog) {
    await NotificationLog.create({
      channel,
      recipient: recipient || "unknown",
      subject,
      message,
      status,
      detail: result.reason,
      user: metadata.user,
      order: metadata.order
    }).catch((error) => console.error("Unable to log notification:", error.message));
  }
  return result;
}

module.exports = {
  email: (to, subject, text, metadata, html) => deliver("email", to, text, subject, metadata, html),
  sms: (to, text, metadata) => deliver("sms", to, text, undefined, metadata),
  whatsapp: (to, text, metadata) => deliver("whatsapp", to, text, undefined, metadata)
};
