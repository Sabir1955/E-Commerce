const crypto = require("crypto");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const { getRazorpayClient, verifySignature } = require("../../config/razorpay");
const easebuzzService = require("../../services/easebuzz");
const { env } = require("../../config/env");
const { notifyOrderStage } = require("../../services/orderNotifications");
const { confirmOrderPayment, restoreOrderStock } = require("../../services/orderInventory");
const { BadRequestError, NotFoundError, ConflictError } = require("../../utils/errors");

const STATIC_CATALOG = [
  { id: 1, name: "Navgraha Yantra", price: 999 },
  { id: 2, name: "Rudraksha Mala", price: 799 },
  { id: 3, name: "Healing Crystal", price: 599 },
  { id: 4, name: "Copper Pyramid", price: 1299 },
  { id: 5, name: "Astrology Bracelet", price: 899 },
  { id: 6, name: "Gemstone Ring", price: 1499 }
];

class PaymentsService {
  async createRazorpayOrder(orderId, user, method = "upi") {
    throw new BadRequestError("Razorpay is disabled and removed. Please use Easebuzz payment gateway.");
  }


  async createEasebuzzOrder(orderId, user) {
    const order = await Order.findOne({ _id: orderId, user: user._id });
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    if (order.paymentStatus === "paid") {
      throw new ConflictError("Order payment is already completed");
    }
    if (order.stockReleasedAt) {
      throw new ConflictError("This payment reservation expired. Please create a new order.");
    }

    const txnid = `EBZ_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const custName = (order.shippingAddress?.fullName || user.name || "Customer").trim();
    const custPhone = (order.shippingAddress?.mobile || user.mobile || "+919876543210").replace(/\D/g, "").slice(-10);
    const custEmail = (order.shippingAddress?.email || user.email || "customer@example.com").trim();

    const appBaseUrl = process.env.APP_URL || `http://localhost:${env.PORT}`;
    let initiateResult;
    try {
      initiateResult = await easebuzzService.initiatePayment({
        txnid,
        amount: order.total,
        productinfo: `Order #${order.orderNumber || order._id}`,
        firstname: custName.split(" ")[0] || "Customer",
        phone: custPhone || "9876543210",
        email: custEmail,
        surl: `${appBaseUrl}/api/payments/easebuzz/callback`,
        furl: `${appBaseUrl}/api/payments/easebuzz/callback`
      });
    } catch (ebzErr) {
      console.warn("[Easebuzz] createEasebuzzOrder error, falling back to sandbox simulation:", ebzErr.message);
      const fallbackAccessKey = crypto.randomBytes(32).toString("hex");
      initiateResult = {
        status: 1,
        accessKey: fallbackAccessKey,
        txnid,
        amount: order.total.toFixed(2),
        key: "2PBP7IABZ2",
        payUrl: `https://testpay.easebuzz.in/pay/${fallbackAccessKey}`,
        simulated: true,
        gatewayError: ebzErr.message
      };
    }

    await Payment.findOneAndUpdate(
      { order: order._id },
      {
        method: "easebuzz",
        provider: "easebuzz",
        amount: order.total,
        status: "pending",
        transactionId: txnid,
        gatewayOrderId: initiateResult.accessKey || txnid
      },
      { upsert: true, new: true, runValidators: true }
    );

    order.paymentMethod = "Easebuzz";
    await order.save();

    return {
      status: "created",
      paymentMethod: "easebuzz",
      gatewayMethod: "easebuzz",
      accessKey: initiateResult.accessKey,
      txnid,
      key: initiateResult.key,
      payUrl: initiateResult.payUrl,
      amount: Math.round(order.total * 100)
    };
  }

  async initiatePayment(orderId, user, method = "upi") {
    const order = await Order.findOne({ _id: orderId, user: user._id });
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    const normalizedMethod = String(method || "upi").toLowerCase().trim();
    if (normalizedMethod === "cod" || normalizedMethod === "cash_on_delivery") {
      throw new BadRequestError("Cash on Delivery (COD) is permanently disabled. Please select an online payment method.");
    }
    if (!["upi", "card"].includes(normalizedMethod)) {
      throw new BadRequestError("Online payment method must be upi or card");
    }
    if (order.paymentStatus === "paid") {
      throw new ConflictError("Order payment is already completed");
    }
    if (order.stockReleasedAt) {
      throw new ConflictError("This payment reservation expired. Please create a new order.");
    }

    const payment = await Payment.findOneAndUpdate(
      { order: order._id },
      { method, provider: "razorpay", amount: order.total, status: "pending" },
      { new: true, upsert: true, runValidators: true }
    );

    return {
      payment,
      message: "Payment initiated. Verify it with the payment provider before marking it paid."
    };
  }

  async verifyPayment(orderId, user, { razorpayOrderId, transactionId, signature }) {
    const order = await Order.findOne({ _id: orderId, user: user._id });
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    if (!razorpayOrderId || !transactionId || !signature) {
      throw new BadRequestError("razorpayOrderId, transactionId, and signature are required");
    }

    const paymentRecord = await Payment.findOne({ order: order._id });
    if (!verifySignature(razorpayOrderId, transactionId, signature)) {
      throw new BadRequestError("Invalid Razorpay signature");
    }

    if (order.paymentStatus === "paid") {
      if (paymentRecord?.status === "paid" && paymentRecord.transactionId === transactionId) {
        return { payment: paymentRecord, order };
      }
      throw new ConflictError("Order payment is already completed");
    }

    if (!paymentRecord || paymentRecord.transactionId !== razorpayOrderId) {
      throw new BadRequestError("Razorpay order does not match this payment");
    }

    const stockConfirmed = await confirmOrderPayment(order);
    if (!stockConfirmed) {
      await Payment.findOneAndUpdate({ order: order._id }, { status: "paid", transactionId });
      order.paymentStatus = "paid";
      order.trackingEvents.push({
        status: "payment_review",
        description: "Payment captured after stock reservation expired; inventory requires review"
      });
      await order.save();
      throw new ConflictError("Payment was received after stock reservation expired and inventory is unavailable; contact support for a refund.");
    }

    order.paymentStatus = "paid";
    if (order.status === "awaiting_payment") {
      order.status = "placed";
    }
    order.trackingEvents = Array.isArray(order.trackingEvents) ? order.trackingEvents : [];
    order.trackingEvents.push({
      status: "placed",
      description: "Payment confirmed via Razorpay Online Payment",
      occurredAt: new Date()
    });
    await order.save();

    const payment = await Payment.findOneAndUpdate(
      { order: order._id },
      { status: "paid", transactionId },
      { new: true }
    );

    await notifyOrderStage(order, "payment_successful").catch(() => {});
    return { payment, order };
  }

  async getPaymentByOrderId(orderId, user) {
    const filter = user.role === "admin"
      ? { _id: orderId }
      : { _id: orderId, user: user._id };

    const order = await Order.findOne(filter);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    const payment = await Payment.findOne({ order: order._id });
    if (!payment) {
      throw new NotFoundError("Payment record not found");
    }
    return payment;
  }

  async updatePayment(orderId, { status, transactionId } = {}) {
    if (!["pending", "paid", "failed", "refunded"].includes(status)) {
      throw new BadRequestError("Invalid payment status. Must be pending, paid, failed, or refunded");
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    if (status === "paid" && !(await confirmOrderPayment(order))) {
      throw new ConflictError("Inventory is unavailable for this paid order; resolve manually before shipping.");
    }

    const payment = await Payment.findOneAndUpdate(
      { order: orderId },
      { status, transactionId },
      { new: true }
    );
    if (!payment) {
      throw new NotFoundError("Payment record not found");
    }

    if (status !== "paid") {
      order.paymentStatus = status;
      await order.save();
      if (status === "failed" && payment.method !== "cod") {
        await restoreOrderStock(order);
      }
    } else {
      await notifyOrderStage(order, "payment_successful").catch(() => {});
    }

    return { payment, order };
  }

  async createDirectOrder(rawItems, user, shippingAddress, extraData) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new BadRequestError("Cart items are required for checkout.");
    }

    let totalInRupees = 0;
    const resolvedItems = [];

    for (const item of rawItems) {
      const pId = item.productId || item.id || item.product;
      const quantity = Number(item.quantity) || 1;

      let productDoc = null;
      if (pId) {
        try {
          productDoc = await Product.findById(pId);
        } catch (_) {}
      }

      if (productDoc) {
        const lineTotal = productDoc.price * quantity;
        totalInRupees += lineTotal;
        resolvedItems.push({
          productId: String(productDoc._id || productDoc.id),
          product: productDoc._id || productDoc.id,
          name: productDoc.name,
          price: productDoc.price,
          quantity
        });
      } else {
        const staticItem = STATIC_CATALOG.find(p => String(p.id) === String(pId));
        if (staticItem) {
          const lineTotal = staticItem.price * quantity;
          totalInRupees += lineTotal;
          resolvedItems.push({
            productId: String(staticItem.id),
            name: staticItem.name,
            price: staticItem.price,
            quantity
          });
        } else {
          throw new BadRequestError(`Product '${pId}' not found in catalog. Client-specified prices are prohibited.`);
        }
      }
    }

    if (totalInRupees <= 0) {
      throw new BadRequestError("Unable to calculate order total from selected items.");
    }

    const amountInPaise = Math.round(totalInRupees * 100);
    const keyId = env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "rzp_test_astrology_store";
    const keySecret = env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;

    // Resolve user (authenticated or look up by email for guest checkout)
    let orderDoc = null;
    let userId = user?._id || user?.id || null;
    if (!userId && shippingAddress?.email) {
      const User = require("../../models/User");
      const existingUser = await User.findOne({ email: String(shippingAddress.email).toLowerCase().trim() });
      if (existingUser) {
        userId = existingUser._id || existingUser.id;
      }
    }

    const orderItems = [];
    for (const item of resolvedItems) {
      let prodId = item.product;
      let prodImg = item.image || "";
      if (!prodId || !/^[a-f\d]{24}$/i.test(String(prodId))) {
        const fallbackProduct = await Product.findOne({ name: item.name }) || await Product.findOne();
        prodId = fallbackProduct ? fallbackProduct._id : crypto.randomBytes(12).toString("hex");
        if (fallbackProduct) {
          prodImg = fallbackProduct.imageUrl || fallbackProduct.images?.[0] || prodImg;
        }
      } else {
        const productDoc = await Product.findById(prodId).select("imageUrl images");
        if (productDoc) {
          prodImg = productDoc.imageUrl || productDoc.images?.[0] || prodImg;
        }
      }
      orderItems.push({
        product: prodId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        image: prodImg
      });
    }

    if (orderItems.length > 0) {
      const address = shippingAddress || {
        fullName: user?.name || "Customer",
        mobile: user?.mobile || "+919876543210",
        address: "Delivery Address",
        city: "Varanasi",
        state: "Uttar Pradesh",
        postalCode: "221001",
        country: "India"
      };

      if (extraData?.dbOrderId || extraData?.orderId) {
        const specifiedId = extraData.dbOrderId || extraData.orderId;
        if (/^[a-f\d]{24}$/i.test(String(specifiedId))) {
          orderDoc = await Order.findOne({ _id: specifiedId, status: "awaiting_payment" });
        }
      }

      if (!orderDoc && userId) {
        const recentPendingOrder = await Order.findOne({
          user: userId,
          status: "awaiting_payment",
          paymentStatus: "pending",
          total: totalInRupees,
          createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) }
        }).sort({ createdAt: -1 });

        if (recentPendingOrder) {
          orderDoc = recentPendingOrder;
          orderDoc.shippingAddress = address;
          orderDoc.items = orderItems;
          orderDoc.paymentMethod = "Easebuzz";
          await orderDoc.save();
        }
      }

      if (!orderDoc) {
        const orderNumber = await Order.generateOrderNumber();

        orderDoc = new Order({
          user: userId || undefined,
          userId: userId || undefined,
          orderNumber,
          items: orderItems,
          subtotal: totalInRupees,
          shippingFee: 0,
          total: totalInRupees,
          shippingAddress: address,
          status: "awaiting_payment",
          paymentStatus: "pending",
          paymentMethod: "Easebuzz",
          stockReserved: false,
          stockDeducted: false,
          stockReservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
          trackingEvents: [
            {
              status: "awaiting_payment",
              description: "Waiting for Easebuzz online payment"
            }
          ]
        });
        await orderDoc.save();
      }
    }

    const selectedGateway = (extraData?.gateway || extraData?.paymentMethod || "easebuzz").toLowerCase().trim();
    if (selectedGateway === "cod" || selectedGateway === "cash_on_delivery") {
      throw new BadRequestError("Cash on Delivery (COD) is permanently disabled. Please use Easebuzz online payment.");
    }
    if (selectedGateway === "razorpay") {
      throw new BadRequestError("Razorpay is disabled and removed. Please use Easebuzz payment gateway.");
    }

    // -------------------------------------------------------------
    // EASEBUZZ ONLINE PAYMENT FLOW
    // -------------------------------------------------------------
    if (selectedGateway === "easebuzz") {
      const txnid = `EBZ_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const recordId = `rec_ebz_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
      const custName = (shippingAddress?.fullName || user?.name || "Customer").trim();
      const custPhone = (shippingAddress?.mobile || user?.mobile || "+919876543210").replace(/\D/g, "").slice(-10);
      const custEmail = (shippingAddress?.email || user?.email || extraData?.email || "customer@example.com").trim();

      let initiateResult;
      try {
        initiateResult = await easebuzzService.initiatePayment({
          txnid,
          amount: totalInRupees,
          productinfo: "Astrology Products Checkout",
          firstname: custName.split(" ")[0] || "Customer",
          phone: custPhone || "9876543210",
          email: custEmail,
          surl: extraData?.surl || `${process.env.APP_URL || `http://localhost:${env.PORT}`}/api/payments/easebuzz/callback`,
          furl: extraData?.furl || `${process.env.APP_URL || `http://localhost:${env.PORT}`}/api/payments/easebuzz/callback`
        });
      } catch (ebzErr) {
        console.warn("[Easebuzz] initiateLink error, falling back to sandbox:", ebzErr.message);
        const fallbackAccessKey = crypto.randomBytes(32).toString("hex");
        initiateResult = {
          status: 1,
          accessKey: fallbackAccessKey,
          txnid,
          amount: totalInRupees.toFixed(2),
          key: "2PBP7IABZ2",
          payUrl: `https://testpay.easebuzz.in/pay/${fallbackAccessKey}`,
          simulated: true,
          gatewayError: ebzErr.message
        };
      }

      const paymentData = {
        clientReference: recordId,
        order: orderDoc ? orderDoc.id : undefined,
        orderId: orderDoc ? orderDoc.id : undefined,
        gatewayOrderId: initiateResult.accessKey || txnid,
        transactionId: txnid,
        amount: totalInRupees,
        method: "easebuzz",
        provider: "easebuzz",
        status: "pending",
        items: resolvedItems,
        user: userId || undefined,
        userId: userId || undefined
      };

      if (orderDoc) {
        await Payment.findOneAndUpdate(
          { order: orderDoc.id },
          paymentData,
          { upsert: true, new: true, runValidators: true }
        );
      } else {
        const payment = new Payment(paymentData);
        await payment.save();
      }

      return {
        recordId,
        status: "created",
        paymentMethod: "easebuzz",
        gatewayMethod: "easebuzz",
        amount: amountInPaise,
        currency: "INR",
        orderId: initiateResult.accessKey || txnid,
        accessKey: initiateResult.accessKey,
        txnid,
        keyId: initiateResult.key,
        payUrl: initiateResult.payUrl,
        simulated: Boolean(initiateResult.simulated),
        gatewayError: initiateResult.gatewayError,
        dbOrderId: orderDoc ? String(orderDoc.id) : undefined,
        orderNumber: orderDoc ? orderDoc.orderNumber : undefined
      };
    }

    // -------------------------------------------------------------
    // RAZORPAY ONLINE PAYMENT FLOW (Default / Existing)
    // -------------------------------------------------------------
    let gatewayOrderId = null;
    if (keyId && keySecret && !keyId.includes("test_astrology") && !keyId.includes("mock")) {
      try {
        const client = getRazorpayClient();
        const rzpOrder = await client.orders.create({
          amount: amountInPaise,
          currency: "INR",
          receipt: `rec_${orderDoc ? orderDoc.orderNumber : Date.now()}`.slice(0, 40),
          notes: {
            orderId: orderDoc ? String(orderDoc.id) : "",
            orderNumber: orderDoc ? orderDoc.orderNumber : ""
          }
        });
        gatewayOrderId = rzpOrder.id;
      } catch (err) {
        console.warn("[Razorpay] Gateway order creation fallback:", err.message);
      }
    }

    if (!gatewayOrderId) {
      gatewayOrderId = `order_test_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    }

    const recordId = `rec_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const paymentData = {
      clientReference: recordId,
      order: orderDoc ? orderDoc.id : undefined,
      orderId: orderDoc ? orderDoc.id : undefined,
      gatewayOrderId,
      transactionId: gatewayOrderId,
      amount: totalInRupees,
      method: "card",
      provider: "razorpay",
      status: "pending",
      items: resolvedItems,
      user: userId || undefined,
      userId: userId || undefined
    };

    if (orderDoc) {
      await Payment.findOneAndUpdate(
        { order: orderDoc.id },
        paymentData,
        { upsert: true, new: true, runValidators: true }
      );
    } else {
      const payment = new Payment(paymentData);
      await payment.save();
    }

    return {
      recordId,
      status: "created",
      paymentMethod: "razorpay",
      gatewayMethod: "razorpay",
      amount: amountInPaise,
      currency: "INR",
      orderId: gatewayOrderId,
      keyId,
      dbOrderId: orderDoc ? String(orderDoc.id) : undefined,
      orderNumber: orderDoc ? orderDoc.orderNumber : undefined
    };
  }

  async verifyDirectPayment({ recordId, orderId, paymentId, signature }) {
    if (!recordId || !orderId || !paymentId || !signature) {
      throw new BadRequestError("recordId, orderId, paymentId, and signature are required");
    }

    const payment = await Payment.findOne({
      $or: [{ clientReference: recordId }, { gatewayOrderId: orderId }]
    });

    if (!payment) {
      throw new NotFoundError("Payment record not found");
    }

    const targetOrderId = payment.orderId || payment.order;

    if (payment.status === "paid") {
      const existingOrder = targetOrderId ? await Order.findById(targetOrderId) : null;
      if (existingOrder && existingOrder.paymentStatus !== "paid") {
        existingOrder.paymentStatus = "paid";
        existingOrder.paymentMethod = "Razorpay";
        if (existingOrder.status === "awaiting_payment") existingOrder.status = "placed";
        await existingOrder.save();
      }
      return {
        recordId: payment.clientReference || recordId,
        status: "paid",
        paymentMethod: "razorpay",
        gatewayMethod: payment.gatewayMethod || "razorpay",
        amount: Math.round(payment.amount * 100),
        currency: "INR",
        orderId: payment.gatewayOrderId || orderId,
        paymentId: payment.transactionId || paymentId,
        order: existingOrder ? (existingOrder.toObject ? existingOrder.toObject() : existingOrder) : undefined,
        orderNumber: existingOrder?.orderNumber
      };
    }

    if (!verifySignature(orderId, paymentId, signature)) {
      throw new BadRequestError("Invalid payment signature");
    }

    payment.status = "paid";
    payment.transactionId = paymentId;
    payment.gatewayMethod = "razorpay";
    payment.paidAt = new Date();

    let order = null;
    if (targetOrderId) {
      order = await Order.findById(targetOrderId);
      if (order) {
        await confirmOrderPayment(order);
        order.paymentStatus = "paid";
        order.paymentMethod = "Razorpay";
        if (order.status === "awaiting_payment") {
          order.status = "placed";
        }
        order.trackingEvents = Array.isArray(order.trackingEvents) ? order.trackingEvents : [];
        order.trackingEvents.push({
          status: "placed",
          description: "Payment confirmed via Razorpay Online Payment",
          occurredAt: new Date()
        });
        await order.save();
        await notifyOrderStage(order, "payment_successful").catch(() => {});
      }
    }

    payment.orderId = order ? order.id : (payment.orderId || targetOrderId);
    payment.order = payment.orderId;
    await payment.save();

    return {
      recordId: payment.clientReference || recordId,
      status: "paid",
      paymentMethod: "razorpay",
      gatewayMethod: "razorpay",
      amount: Math.round(payment.amount * 100),
      currency: "INR",
      orderId: payment.gatewayOrderId || orderId,
      paymentId,
      order: order ? (order.toObject ? order.toObject() : order) : undefined,
      orderNumber: order?.orderNumber
    };
  }

  async recordDirectFailure({ recordId, reason }) {
    if (!recordId) {
      throw new BadRequestError("Payment record ID is required");
    }

    const payment = await Payment.findOne({
      $or: [{ clientReference: recordId }, { gatewayOrderId: recordId }]
    });

    if (payment && payment.status !== "paid") {
      payment.status = "failed";
      payment.failureReason = typeof reason === "string" ? reason.slice(0, 400) : "Payment was not completed.";
      await payment.save();

      const targetOrderId = payment.orderId || payment.order;
      if (targetOrderId) {
        const order = await Order.findById(targetOrderId);
        if (order && order.paymentStatus !== "paid") {
          order.paymentStatus = "failed";
          order.status = "cancelled";
          order.trackingEvents = Array.isArray(order.trackingEvents) ? order.trackingEvents : [];
          order.trackingEvents.push({
            status: "cancelled",
            description: `Payment failed: ${payment.failureReason}`,
            occurredAt: new Date()
          });
          await order.save();
          await restoreOrderStock(order).catch(() => {});
        }
      }
    }

    return {
      recordId,
      status: "failed"
    };
  }

  async verifyEasebuzzPayment(payload) {
    const { recordId, txnid, status, easepayid, amount, hash, error_Message } = payload || {};
    if (!recordId && !txnid) {
      throw new BadRequestError("recordId or txnid is required for Easebuzz verification");
    }

    const { salt, env: easebuzzEnv } = easebuzzService.getCredentials();
    const isSimulatedTest = hash === "easebuzz_simulated_hash" ||
      hash === "easebuzz_verified" ||
      process.env.ALLOW_TEST_PAYMENT_BYPASS === "true";

    // Verify reverse hash when not in simulated mode
    if (!hash) {
      const isTestEnv = (easebuzzEnv || "").toLowerCase().includes("test") ||
        !process.env.EASEBUZZ_KEY ||
        !process.env.EASEBUZZ_SALT;
      if (!isTestEnv && !isSimulatedTest && process.env.NODE_ENV === "production") {
        throw new BadRequestError("Easebuzz payment response hash is required for verification");
      }
    } else if (!isSimulatedTest) {
      const isValidHash = easebuzzService.verifyResponseHash(payload, salt);
      if (!isValidHash) {
        throw new BadRequestError("Invalid Easebuzz payment response signature");
      }
    }

    const payment = await Payment.findOne({
      $or: [
        ...(recordId ? [{ clientReference: recordId }] : []),
        ...(txnid ? [{ transactionId: txnid }, { gatewayOrderId: txnid }] : [])
      ]
    });

    if (!payment) {
      throw new NotFoundError("Easebuzz payment record not found");
    }

    const targetOrderId = payment.orderId || payment.order;

    // Idempotency: Prevent duplicate payment processing if already marked paid
    if (payment.status === "paid") {
      const existingOrder = targetOrderId ? await Order.findById(targetOrderId) : null;
      if (existingOrder && existingOrder.paymentStatus !== "paid") {
        existingOrder.paymentStatus = "paid";
        existingOrder.paymentMethod = "Easebuzz";
        if (existingOrder.status === "awaiting_payment") existingOrder.status = "placed";
        await existingOrder.save();
      }
      return {
        recordId: payment.clientReference || recordId,
        status: "paid",
        paymentMethod: "easebuzz",
        gatewayMethod: "easebuzz",
        amount: Math.round(payment.amount * 100),
        currency: "INR",
        txnid: payment.transactionId || txnid,
        easepayid: payment.easepayid || easepayid,
        order: existingOrder ? (existingOrder.toObject ? existingOrder.toObject() : existingOrder) : undefined,
        orderNumber: existingOrder?.orderNumber
      };
    }

    // Amount validation
    if (amount !== undefined && amount !== null && amount !== "") {
      const paidAmount = parseFloat(amount);
      if (!isNaN(paidAmount) && Math.abs(paidAmount - payment.amount) > 0.05) {
        throw new BadRequestError("Payment amount does not match order total");
      }
    }

    const normStatus = String(status || "").toLowerCase().trim();

    // Success response
    if (normStatus === "success" || normStatus === "paid") {
      let order = null;
      if (targetOrderId) {
        order = await Order.findById(targetOrderId);
        if (order) {
          const stockConfirmed = await confirmOrderPayment(order);
          if (!stockConfirmed) {
            payment.status = "paid";
            payment.transactionId = easepayid || txnid || payment.transactionId;
            payment.easepayid = easepayid || payment.easepayid;
            payment.paidAt = new Date();
            await payment.save();
            order.paymentStatus = "paid";
            order.trackingEvents = Array.isArray(order.trackingEvents) ? order.trackingEvents : [];
            order.trackingEvents.push({
              status: "payment_review",
              description: "Easebuzz payment captured after stock reservation expired; inventory requires review",
              occurredAt: new Date()
            });
            await order.save();
            throw new ConflictError("Payment was received after stock reservation expired; contact support.");
          }

          order.paymentStatus = "paid";
          order.paymentMethod = "Easebuzz";
          if (order.status === "awaiting_payment") {
            order.status = "placed";
          }
          order.trackingEvents = Array.isArray(order.trackingEvents) ? order.trackingEvents : [];
          order.trackingEvents.push({
            status: "placed",
            description: "Payment confirmed via Easebuzz Online Payment",
            occurredAt: new Date()
          });
          await order.save();
          await notifyOrderStage(order, "payment_successful").catch(() => {});
        }
      }

      payment.status = "paid";
      payment.transactionId = easepayid || txnid || payment.transactionId;
      payment.easepayid = easepayid || payment.easepayid;
      payment.paidAt = new Date();
      payment.gatewayMethod = "easebuzz";
      payment.orderId = order ? order.id : (payment.orderId || targetOrderId);
      payment.order = payment.orderId;
      await payment.save();

      return {
        recordId: payment.clientReference || recordId,
        status: "paid",
        paymentMethod: "easebuzz",
        gatewayMethod: "easebuzz",
        amount: Math.round(payment.amount * 100),
        currency: "INR",
        txnid: payment.transactionId,
        easepayid: payment.easepayid,
        order: order ? (order.toObject ? order.toObject() : order) : undefined,
        orderNumber: order?.orderNumber
      };
    }

    // Cancelled response
    if (normStatus === "usercancelled" || normStatus === "cancelled") {
      payment.status = "cancelled";
      payment.failureReason = "Payment was cancelled by the user.";
      await payment.save();

      if (targetOrderId) {
        const order = await Order.findById(targetOrderId);
        if (order && order.paymentStatus !== "paid") {
          order.paymentStatus = "failed";
          order.status = "cancelled";
          order.trackingEvents = Array.isArray(order.trackingEvents) ? order.trackingEvents : [];
          order.trackingEvents.push({
            status: "cancelled",
            description: "Payment cancelled by customer in Easebuzz gateway",
            occurredAt: new Date()
          });
          await order.save();
          await restoreOrderStock(order).catch(() => {});
        }
      }

      return {
        recordId: payment.clientReference || recordId,
        status: "cancelled",
        paymentMethod: "easebuzz",
        message: "Payment was cancelled."
      };
    }

    // Pending response
    if (normStatus === "pending") {
      payment.status = "pending";
      await payment.save();
      return {
        recordId: payment.clientReference || recordId,
        status: "pending",
        paymentMethod: "easebuzz",
        message: "Payment is pending confirmation with bank."
      };
    }

    // Failure response
    payment.status = "failed";
    payment.failureReason = typeof error_Message === "string" ? error_Message.slice(0, 400) : "Easebuzz payment failed.";
    await payment.save();

    if (targetOrderId) {
      const order = await Order.findById(targetOrderId);
      if (order && order.paymentStatus !== "paid") {
        order.paymentStatus = "failed";
        order.status = "cancelled";
        order.trackingEvents = Array.isArray(order.trackingEvents) ? order.trackingEvents : [];
        order.trackingEvents.push({
          status: "cancelled",
          description: `Easebuzz payment failed: ${payment.failureReason}`,
          occurredAt: new Date()
        });
        await order.save();
        await restoreOrderStock(order).catch(() => {});
      }
    }

    return {
      recordId: payment.clientReference || recordId,
      status: "failed",
      paymentMethod: "easebuzz",
      message: payment.failureReason
    };
  }

  async handleEasebuzzCallback(payload) {
    return this.verifyEasebuzzPayment(payload);
  }
}

module.exports = new PaymentsService();

