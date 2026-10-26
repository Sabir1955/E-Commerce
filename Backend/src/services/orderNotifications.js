const notifications = require("./notificationDelivery");

function orderNumber(order) {
  return order.orderNumber || `ORD-${String(order._id).slice(-6).toUpperCase()}`;
}

function formatAmount(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function statusLabel(status) {
  return String(status || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function wrapEmailHtml(headline, bodyContent) {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7f3eb; padding: 24px 12px; color: #30272a; line-height: 1.6;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #d8b88e; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
        <div style="background: linear-gradient(135deg, #20233b 0%, #151829 100%); padding: 24px; text-align: center; border-bottom: 3px solid #b99a45;">
          <h1 style="color: #b99a45; font-size: 22px; margin: 0; font-family: Georgia, serif; letter-spacing: 1px;">🕉 JYOTISH ASTROLOGY</h1>
          <p style="color: #f0e7d5; margin: 6px 0 0 0; font-size: 13px;">Vedic Gems, Yantras & Sacred Remedies</p>
        </div>
        <div style="padding: 28px 24px;">
          <h2 style="color: #8f1830; font-size: 20px; margin-top: 0; border-bottom: 1px solid #f0e7d5; padding-bottom: 10px;">${headline}</h2>
          ${bodyContent}
        </div>
        <div style="background: #f0e7d5; padding: 16px 24px; text-align: center; font-size: 12px; color: #5b4167; border-top: 1px solid #d8b88e;">
          <p style="margin: 0;">Thank you for shopping with Jyotish Astrology Store. Blessed regards!</p>
          <p style="margin: 4px 0 0 0; color: #777;">For inquiries, please reply directly to this email or visit our website.</p>
        </div>
      </div>
    </div>
  `;
}

function renderItemsHtml(order) {
  if (!Array.isArray(order.items) || order.items.length === 0) return "";
  const rows = order.items.map(item => `
    <tr style="border-bottom: 1px solid #f0e7d5;">
      <td style="padding: 10px 0; color: #30272a; font-weight: 500;">${item.name || "Astrology Product"}</td>
      <td style="padding: 10px 0; text-align: center; color: #555;">x${item.quantity || 1}</td>
      <td style="padding: 10px 0; text-align: right; color: #8f1830; font-weight: 600;">${formatAmount((item.price || 0) * (item.quantity || 1))}</td>
    </tr>
  `).join("");

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <thead>
        <tr style="border-bottom: 2px solid #b99a45; color: #20233b; font-size: 13px;">
          <th style="padding: 8px 0; text-align: left;">Product</th>
          <th style="padding: 8px 0; text-align: center;">Qty</th>
          <th style="padding: 8px 0; text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function stageTemplates(order, stage, extra = "") {
  const number = orderNumber(order);
  const amount = formatAmount(order.total);
  const status = statusLabel(stage);
  const customerName = order.user?.name || order.shippingAddress?.fullName || "Valued Customer";
  const address = order.shippingAddress || {};
  const addrStr = [address.address, address.city, address.state, address.postalCode].filter(Boolean).join(", ");
  const paymentMethod = order.paymentMethod || "Online";

  switch (stage) {
    case "confirmed":
    case "order_success":
      return {
        subject: `Order Confirmed: ${number}`,
        text: `Hello ${customerName},\n\nYour order ${number} has been placed successfully!\n\nOrder Total: ${amount}\nPayment Method: ${paymentMethod}\nStatus: Confirmed\n\nDelivery Address:\n${addrStr}\n\nThank you for choosing Jyotish Astrology Store!`,
        html: wrapEmailHtml(
          "Order Placed Successfully!",
          `
            <p>Hello <strong>${customerName}</strong>,</p>
            <p>Your sacred order <strong>${number}</strong> has been received and confirmed.</p>
            <div style="background: #fbf8f2; border: 1px solid #d8b88e; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Order ID:</strong> ${number}</p>
              <p style="margin: 4px 0;"><strong>Payment Method:</strong> ${paymentMethod}</p>
              <p style="margin: 4px 0;"><strong>Total Amount:</strong> <span style="color: #8f1830; font-size: 16px; font-weight: bold;">${amount}</span></p>
              ${addrStr ? `<p style="margin: 4px 0;"><strong>Shipping To:</strong> ${addrStr}</p>` : ""}
            </div>
            ${renderItemsHtml(order)}
            <p>We are carefully energizing and packing your sacred items for prompt delivery.</p>
          `
        )
      };

    case "payment_successful":
      return {
        subject: `Payment Received: Order ${number}`,
        text: `Hello ${customerName},\n\nPayment for your order ${number} was successful!\n\nAmount Paid: ${amount}\nStatus: Paid\n\nThank you for your payment.`,
        html: wrapEmailHtml(
          "Payment Successful",
          `
            <p>Hello <strong>${customerName}</strong>,</p>
            <p>We have successfully verified your payment of <strong>${amount}</strong> for order <strong>${number}</strong>.</p>
            <div style="background: #eef9f2; border: 1px solid #68d391; border-radius: 8px; padding: 16px; margin: 16px 0; color: #22543d;">
              <p style="margin: 0; font-weight: bold;">✓ Payment Status: PAID</p>
              <p style="margin: 4px 0 0 0;">Transaction confirmed via secure payment gateway.</p>
            </div>
            ${renderItemsHtml(order)}
            <p>Your order is now prioritized for processing and shipment.</p>
          `
        )
      };

    case "processing":
      return {
        subject: `Order In Preparation: ${number}`,
        text: `Hello ${customerName},\n\nYour order ${number} is now being processed and packed.\n\nTotal: ${amount}\nStatus: Processing\n\nWe will notify you once your order is dispatched.`,
        html: wrapEmailHtml(
          "Your Order is Being Processed",
          `
            <p>Hello <strong>${customerName}</strong>,</p>
            <p>Our team is now processing and ritually packing your order <strong>${number}</strong>.</p>
            <div style="background: #fbf8f2; border: 1px solid #d8b88e; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Order Status:</strong> Processing</p>
              <p style="margin: 4px 0;"><strong>Total:</strong> ${amount}</p>
            </div>
            <p>We are ensuring every item is cleansed, verified, and safely packed.</p>
          `
        )
      };

    case "shipped":
      return {
        subject: `Order Shipped: ${number}`,
        text: `Hello ${customerName},\n\nYour order ${number} has been shipped!\n\nAmount: ${amount}\n${extra ? `Tracking Details: ${extra}\n` : ""}Thank you for shopping with us.`,
        html: wrapEmailHtml(
          "Your Order Has Shipped!",
          `
            <p>Hello <strong>${customerName}</strong>,</p>
            <p>Exciting news! Order <strong>${number}</strong> has been handed over to our courier partner.</p>
            <div style="background: #fbf8f2; border: 1px solid #d8b88e; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Status:</strong> Shipped</p>
              ${extra ? `<p style="margin: 4px 0;"><strong>Tracking Info:</strong> ${extra}</p>` : ""}
            </div>
            <p>Please keep an eye out for updates as your sacred parcel makes its way to you.</p>
          `
        )
      };

    case "out_for_delivery":
      return {
        subject: `Out for Delivery: Order ${number}`,
        text: `Hello ${customerName},\n\nYour order ${number} is out for delivery today!\n\nPlease keep your contact number available.`,
        html: wrapEmailHtml(
          "Out for Delivery Today",
          `
            <p>Hello <strong>${customerName}</strong>,</p>
            <p>Your order <strong>${number}</strong> is out for delivery today.</p>
            <p>Our courier executive will be visiting your shipping address soon. Please ensure someone is available to receive the package.</p>
          `
        )
      };

    case "delivered":
      return {
        subject: `Order Delivered: ${number}`,
        text: `Hello ${customerName},\n\nYour order ${number} has been successfully delivered!\n\nThank you for shopping with Jyotish Astrology Store.`,
        html: wrapEmailHtml(
          "Order Delivered Successfully",
          `
            <p>Hello <strong>${customerName}</strong>,</p>
            <p>Your order <strong>${number}</strong> has been successfully delivered!</p>
            <div style="background: #eef9f2; border: 1px solid #68d391; border-radius: 8px; padding: 16px; margin: 16px 0; color: #22543d;">
              <p style="margin: 0; font-weight: bold;">✓ Delivered to your address</p>
            </div>
            <p>We hope these sacred items bring harmony, protection, and prosperity into your life. You can share your review on our website anytime.</p>
          `
        )
      };

    case "cancelled":
      return {
        subject: `Order Cancelled: ${number}`,
        text: `Hello ${customerName},\n\nYour order ${number} has been cancelled.\n\n${extra ? `Reason: ${extra}\n` : ""}If this was a prepaid order, your refund is being initiated automatically.\n\nThank you.`,
        html: wrapEmailHtml(
          "Order Cancellation Notice",
          `
            <p>Hello <strong>${customerName}</strong>,</p>
            <p>Your order <strong>${number}</strong> has been cancelled.</p>
            <div style="background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px; padding: 16px; margin: 16px 0; color: #9b2c2c;">
              <p style="margin: 4px 0;"><strong>Status:</strong> Cancelled</p>
              ${extra ? `<p style="margin: 4px 0;"><strong>Notes:</strong> ${extra}</p>` : ""}
            </div>
            <p>If payment was already completed online via Razorpay, a refund will be processed back to your original payment method in 5-7 business days.</p>
          `
        )
      };

    case "return_requested":
      return {
        subject: `Return Request Received: Order ${number}`,
        text: `Hello ${customerName},\n\nWe have received your return request for order ${number}.\n\nReason: ${extra || "Customer request"}\n\nOur team is reviewing your request and will update you shortly.`,
        html: wrapEmailHtml(
          "Return Request Received",
          `
            <p>Hello <strong>${customerName}</strong>,</p>
            <p>We have received your return request for order <strong>${number}</strong>.</p>
            <div style="background: #fbf8f2; border: 1px solid #d8b88e; border-radius: 8px; padding: 16px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Status:</strong> Return Requested</p>
              ${extra ? `<p style="margin: 4px 0;"><strong>Details:</strong> ${extra}</p>` : ""}
            </div>
            <p>Our support team will review your request under our return policy and update you shortly.</p>
          `
        )
      };

    case "return_approved":
      return {
        subject: `Return Approved: Order ${number}`,
        text: `Hello ${customerName},\n\nYour return request for order ${number} has been APPROVED.\n\n${extra ? `${extra}\n\n` : ""}A pickup will be scheduled or refund initiated per our policy.`,
        html: wrapEmailHtml(
          "Return Request Approved",
          `
            <p>Hello <strong>${customerName}</strong>,</p>
            <p>Good news! Your return request for order <strong>${number}</strong> has been approved.</p>
            <div style="background: #eef9f2; border: 1px solid #68d391; border-radius: 8px; padding: 16px; margin: 16px 0; color: #22543d;">
              <p style="margin: 0; font-weight: bold;">✓ Return Status: APPROVED</p>
              ${extra ? `<p style="margin: 6px 0 0 0;">${extra}</p>` : ""}
            </div>
            <p>Our team is processing the reverse logistics or refund as per your original payment method.</p>
          `
        )
      };

    case "return_rejected":
      return {
        subject: `Return Request Update: Order ${number}`,
        text: `Hello ${customerName},\n\nYour return request for order ${number} could not be approved.\n\n${extra ? `Reason: ${extra}\n\n` : ""}If you have any questions, please contact our support team.`,
        html: wrapEmailHtml(
          "Return Request Status Update",
          `
            <p>Hello <strong>${customerName}</strong>,</p>
            <p>Regarding your return request for order <strong>${number}</strong>:</p>
            <div style="background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px; padding: 16px; margin: 16px 0; color: #9b2c2c;">
              <p style="margin: 0; font-weight: bold;">Return Request Rejected</p>
              ${extra ? `<p style="margin: 6px 0 0 0;"><strong>Reason:</strong> ${extra}</p>` : ""}
            </div>
            <p>If you believe this is in error, please reply to this email with photos or further details.</p>
          `
        )
      };

    case "refunded":
      return {
        subject: `Refund Processed: Order ${number}`,
        text: `Hello ${customerName},\n\nYour refund for order ${number} has been processed successfully!\n\nRefund Amount: ${amount}\n${extra ? `Reference: ${extra}\n` : ""}\nFunds should reflect in your account within 5-7 business days.`,
        html: wrapEmailHtml(
          "Refund Processed Successfully",
          `
            <p>Hello <strong>${customerName}</strong>,</p>
            <p>A refund has been issued for order <strong>${number}</strong>.</p>
            <div style="background: #eef9f2; border: 1px solid #68d391; border-radius: 8px; padding: 16px; margin: 16px 0; color: #22543d;">
              <p style="margin: 0; font-weight: bold;">✓ Refund Amount: ${amount}</p>
              ${extra ? `<p style="margin: 6px 0 0 0;"><strong>Reference:</strong> ${extra}</p>` : ""}
            </div>
            <p>The refunded amount will reflect in your original payment account / bank within 5 to 7 working days depending on your bank.</p>
          `
        )
      };

    default:
      return {
        subject: `Order ${number} - ${status}`,
        text: `Hello ${customerName},\n\nYour order ${number} status is now: ${status}.\n\nTotal: ${amount}`,
        html: wrapEmailHtml(
          `Order Status: ${status}`,
          `
            <p>Hello <strong>${customerName}</strong>,</p>
            <p>Your order <strong>${number}</strong> status has been updated to: <strong>${status}</strong>.</p>
            <p>Total: <strong>${amount}</strong></p>
          `
        )
      };
  }
}

async function notifyCustomer(order, subject, message, html = null) {
  let user = order.user;
  if (!user || !user.email) {
    await order.populate("user", "name email mobile notificationPreferences").catch(() => {});
    user = order.user || {};
  }
  const address = order.shippingAddress || {};
  const recipientEmail = user.email || address.email;
  const mobile = address.mobile || address.phone || user.mobile;
  const preferences = user.notificationPreferences || {};
  const metadata = { user: user._id, order: order._id };

  const willSendEmail = preferences.orderEmail !== false && Boolean(recipientEmail);
  const willSendSms = preferences.orderSms !== false && Boolean(mobile);

  const results = await Promise.allSettled([
    willSendEmail
      ? notifications.email(recipientEmail, subject, message, metadata, html)
      : Promise.resolve({ sent: false, reason: "Order email notifications disabled or missing email" }),
    willSendSms
      ? notifications.sms(mobile, message, { ...metadata, skipLog: willSendEmail })
      : Promise.resolve({ sent: false, reason: "Order SMS notifications disabled" }),
    preferences.orderWhatsapp !== false && mobile
      ? notifications.whatsapp(mobile, message, { ...metadata, skipLog: (willSendEmail || willSendSms) })
      : Promise.resolve({ sent: false, reason: "Order WhatsApp notifications disabled" })
  ]);
  return results.map((result) => result.status === "fulfilled" ? result.value : { sent: false, reason: result.reason.message });
}

async function notifyOrderStage(order, stage, extra = "") {
  const template = stageTemplates(order, stage, extra);
  return notifyCustomer(order, template.subject, template.text, template.html);
}

module.exports = { notifyCustomer, notifyOrderStage, stageTemplates };
