const Order = require("../../models/Order");
const User = require("../../models/User");
const Product = require("../../models/Product");
const Cart = require("../../models/Cart");
const Payment = require("../../models/Payment");
const Address = require("../../models/Address");
const Coupon = require("../../models/Coupon");
const ShippingSetting = require("../../models/ShippingSetting");
const { parsePagination, formatPaginationMeta } = require("../../utils/pagination");
const { BadRequestError, NotFoundError, ConflictError } = require("../../utils/errors");
const { validAddress } = require("../../utils/request");
const {
  createOrderAndPayment,
  restoreOrderStock,
  releaseExpiredReservations,
  confirmOrderPayment
} = require("../../services/orderInventory");
const { notifyOrderStage } = require("../../services/orderNotifications");
const { createInvoicePdf } = require("../../services/invoice");
const InAppNotificationService = require("../../services/inAppNotification.service");

class OrdersService {
  async createOrder(user, body) {
    await releaseExpiredReservations();

    const { items, addressId, shippingAddress: requestedAddress, paymentMethod = "online", couponCode } = body;
    let shippingAddress = requestedAddress;

    if (addressId) {
      const savedAddress = await Address.findOne({ _id: addressId, user: user._id });
      if (!savedAddress) {
        throw new NotFoundError("Saved address not found");
      }
      shippingAddress = savedAddress.toObject();
      delete shippingAddress._id;
      delete shippingAddress.user;
      delete shippingAddress.createdAt;
      delete shippingAddress.updatedAt;
    }

    const cart = await Cart.findOne({ user: user._id });
    const checkoutItems = Array.isArray(items) && items.length ? items : cart?.items;

    if (!Array.isArray(checkoutItems) || checkoutItems.length === 0 || !shippingAddress) {
      throw new BadRequestError("items and shippingAddress are required");
    }

    const normalizedMethod = String(paymentMethod || "easebuzz").toLowerCase().trim();
    if (normalizedMethod === "cod" || normalizedMethod === "cash_on_delivery") {
      throw new BadRequestError("Cash on Delivery (COD) is permanently disabled. Please use Easebuzz online payment.");
    }
    if (normalizedMethod === "razorpay") {
      throw new BadRequestError("Razorpay is disabled and removed. Please use Easebuzz.");
    }
    if (!["upi", "card", "online", "easebuzz"].includes(normalizedMethod)) {
      throw new BadRequestError("Invalid payment method. Please choose Easebuzz.");
    }

    if (!addressId && !validAddress(shippingAddress)) {
      throw new BadRequestError("shippingAddress must include valid fullName, mobile, address, city, state, postalCode, and country");
    }

    if (checkoutItems.length > 50) {
      throw new BadRequestError("Checkout must contain between 1 and 50 items");
    }

    if (checkoutItems.some((item) => !item || typeof item !== "object" || !/^[a-f\d]{24}$/i.test(String(item.product || "")))) {
      throw new BadRequestError("Each item must include a valid product identifier and quantity");
    }

    const productIds = checkoutItems.map((item) => item.product);
    const products = await Product.find({ _id: { $in: productIds }, active: true });
    const productMap = new Map(products.map((product) => [String(product._id), product]));

    const orderItems = [];
    for (const item of checkoutItems) {
      const product = productMap.get(String(item.product));
      const quantity = Number(item.quantity);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new BadRequestError("Each item must reference a valid product and quantity");
      }
      if (product.active === false || product.is_available === false || product.isAvailable === false || product.available === false) {
        throw new ConflictError(`${product.name} is currently unavailable`);
      }
      if (product.stock < quantity) {
        throw new ConflictError(`${product.name} does not have enough stock`);
      }
      orderItems.push({
        product: product._id,
        name: product.name,
        quantity,
        price: product.price,
        image: product.imageUrl || product.images?.[0] || ""
      });
    }

    const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shippingSetting = await ShippingSetting.findOne({ name: "default", active: true });

    let coupon;
    let discountAmount = 0;
    if (couponCode !== undefined) {
      if (typeof couponCode !== "string" || !couponCode.trim() || couponCode.length > 40) {
        throw new BadRequestError("couponCode must be a non-empty string of at most 40 characters");
      }
      const code = String(couponCode).trim().toUpperCase();
      coupon = await Coupon.findOne({ code, active: true });
      const now = new Date();
      if (
        !coupon ||
        (coupon.startsAt && coupon.startsAt > now) ||
        (coupon.endsAt && coupon.endsAt <= now) ||
        (coupon.usageLimit > 0 && coupon.uses >= coupon.usageLimit) ||
        subtotal < coupon.minimumOrderValue
      ) {
        throw new BadRequestError("Coupon is invalid, expired, exhausted, or order does not meet minimum value");
      }
      discountAmount = coupon.discountType === "percentage"
        ? (subtotal * coupon.discountValue) / 100
        : coupon.discountValue;
      if (coupon.maximumDiscount !== undefined) {
        discountAmount = Math.min(discountAmount, coupon.maximumDiscount);
      }
      discountAmount = Math.min(Math.round(discountAmount * 100) / 100, subtotal);
    }

    const discountedSubtotal = subtotal - discountAmount;
    const shippingFee = shippingSetting && shippingSetting.freeShippingMinimum > 0 &&
      discountedSubtotal >= shippingSetting.freeShippingMinimum
        ? 0
        : shippingSetting?.charge || 0;
    const total = discountedSubtotal + shippingFee;

    const reservationExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const order = await createOrderAndPayment({
      itemList: orderItems,
      orderData: {
        user: user._id,
        items: orderItems,
        subtotal,
        discountAmount,
        shippingFee,
        total,
        shippingAddress,
        status: "awaiting_payment",
        paymentStatus: "pending",
        paymentMethod: "Easebuzz",
        stockReserved: true,
        stockDeducted: true,
        stockReservationExpiresAt: reservationExpiresAt,
        trackingEvents: [
          {
            status: "awaiting_payment",
            description: "Waiting for Easebuzz online payment"
          }
        ]
      },
      paymentData: {
        method: "easebuzz",
        provider: "easebuzz",
        amount: total,
        status: "pending"
      },
      cart,
      coupon
    });

    await Product.updateMany(
      { _id: { $in: orderItems.map((item) => item.product) } },
      { $inc: { popularity: 1 } }
    );

    InAppNotificationService.createNotification({
      userId: user._id || user.id,
      title: "Order Placed Successfully",
      message: `Your order #${order.orderNumber} for ₹${Number(order.total).toFixed(2)} has been placed. Complete your online payment to confirm the order.`,
      type: "order",
      link: `/orders/${order._id || order.orderNumber}`,
      metadata: { orderId: order._id, orderNumber: order.orderNumber, total: order.total }
    }).catch((err) => console.warn("Could not send in-app notification:", err.message));

    return order;
  }

  getOrderLookupFilter(orderId, extraFilter = {}) {
    if (!orderId) return extraFilter;
    const cleanId = String(orderId).trim();
    const decodedId = decodeURIComponent(cleanId).trim();
    const strippedId = decodedId.replace(/^#+/, "").trim();

    const candidates = Array.from(new Set([cleanId, decodedId, strippedId].filter(Boolean)));
    const conditions = [];
    for (const cand of candidates) {
      conditions.push({ _id: cand });
      conditions.push({ orderNumber: cand });
    }

    const idFilter = conditions.length === 1 ? conditions[0] : { $or: conditions };
    if (!extraFilter || Object.keys(extraFilter).length === 0) {
      return idFilter;
    }
    return { ...idFilter, ...extraFilter };
  }

  async syncOrderPayment(order) {
    if (!order) return order;
    if (order.paymentStatus !== "paid") {
      const paidPayment = await Payment.findOne({
        $or: [
          { orderId: order._id, status: "paid" },
          { order: order._id, status: "paid" }
        ]
      });
      if (paidPayment) {
        order.paymentStatus = "paid";
        if (order.status === "awaiting_payment") {
          order.status = "placed";
        }
        if (paidPayment.method) {
          order.paymentMethod = paidPayment.method === "easebuzz" ? "Easebuzz" : (paidPayment.method === "razorpay" ? "Razorpay" : order.paymentMethod);
        }
        await order.save().catch(() => {});
      }
    }
    return order;
  }

  async getMyOrders(userId, query, user) {
    const pageData = parsePagination(query);
    if (pageData.error) {
      throw new BadRequestError(pageData.error);
    }

    const effectiveEmail = (query.email || user?.email || "").trim().toLowerCase();
    let userFilter = { user: userId };

    if (user?.role === "admin" && query.email) {
      userFilter = { "shippingAddress.email": effectiveEmail };
    } else if (userId && effectiveEmail) {
      userFilter = {
        $or: [
          { user: userId },
          { "shippingAddress.email": effectiveEmail }
        ]
      };
    } else if (effectiveEmail) {
      userFilter = { "shippingAddress.email": effectiveEmail };
    } else if (userId) {
      userFilter = { user: userId };
    }

    const filter = { ...userFilter };
    if (query.status) {
      filter.status = query.status;
    }
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("items.product", "name imageUrl images price")
        .sort({ createdAt: -1 })
        .skip(pageData.skip)
        .limit(pageData.limit),
      Order.countDocuments(filter)
    ]);

    for (const order of orders) {
      await this.syncOrderPayment(order);
    }

    return {
      orders,
      pagination: formatPaginationMeta(total, pageData.page, pageData.limit)
    };
  }

  async getOrderById(orderId, user) {
    const idFilter = this.getOrderLookupFilter(orderId);
    const filter = user.role === "admin"
      ? idFilter
      : { ...idFilter, user: user._id };

    const order = await Order.findOne(filter)
      .populate("user", "name email mobile")
      .populate("items.product", "name imageUrl images price");
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    await this.syncOrderPayment(order);

    const payment = await Payment.findOne({
      $or: [
        { orderId: order._id },
        { order: order._id }
      ]
    });
    return { order, payment };
  }

  async getOrderTracking(orderId, user) {
    const idFilter = this.getOrderLookupFilter(orderId);
    const filter = user.role === "admin"
      ? idFilter
      : { ...idFilter, user: user._id };

    const order = await Order.findOne(filter).select(
      "_id orderNumber status paymentStatus createdAt updatedAt deliveredAt shipment trackingEvents"
    );
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    return {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      lastUpdated: order.updatedAt,
      deliveredAt: order.deliveredAt,
      shipment: order.shipment,
      trackingEvents: order.trackingEvents || [],
      trackingAvailable: Boolean(order.shipment && (order.shipment.awb || order.shipment.trackingUrl)),
      message: order.shipment?.trackingUrl ? "Use courier tracking link for live shipment updates." : undefined
    };
  }

  async trackByOrderId(orderId) {
    if (!orderId) {
      throw new BadRequestError("Order ID is required to track order");
    }
    const cleanId = String(orderId).trim();
    const strippedId = cleanId.replace(/^#+/, "").trim();
    const isCleanObjectId = /^[a-f\d]{24}$/i.test(cleanId);
    const isStrippedObjectId = /^[a-f\d]{24}$/i.test(strippedId);

    const conditions = [];
    if (isCleanObjectId) conditions.push({ _id: cleanId });
    if (isStrippedObjectId) conditions.push({ _id: strippedId });
    conditions.push({ orderNumber: cleanId });
    if (strippedId && strippedId !== cleanId) conditions.push({ orderNumber: strippedId });

    const escapedClean = cleanId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    conditions.push({ orderNumber: new RegExp(`^${escapedClean}$`, "i") });
    if (strippedId && strippedId !== cleanId) {
      const escapedStripped = strippedId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      conditions.push({ orderNumber: new RegExp(`^${escapedStripped}$`, "i") });
    }

    const filter = conditions.length === 1 ? conditions[0] : { $or: conditions };

    const order = await Order.findOne(filter)
      .populate("user", "name email mobile")
      .populate("items.product", "name imageUrl images price");

    if (!order) {
      throw new NotFoundError("No order found with the provided Order ID");
    }

    const orderObj = order.toObject ? order.toObject() : { ...order };
    if (orderObj.user) {
      if (orderObj.user.email) {
        const [u, d] = orderObj.user.email.split("@");
        orderObj.user.email = `${u.slice(0, 2)}***@${d}`;
      }
      if (orderObj.user.mobile) {
        orderObj.user.mobile = `******${orderObj.user.mobile.slice(-4)}`;
      }
    }
    if (orderObj.shippingAddress) {
      orderObj.shippingAddress = {
        city: orderObj.shippingAddress.city || "",
        state: orderObj.shippingAddress.state || "",
        postalCode: orderObj.shippingAddress.postalCode
          ? `***${String(orderObj.shippingAddress.postalCode).slice(-3)}`
          : "",
        country: orderObj.shippingAddress.country || "IN"
      };
    }

    try {
      const Return = require("../../models/Return");
      const returnDoc = await Return.findOne({
        $or: [
          { order: order._id },
          { orderId: String(order._id) },
          { orderId: String(order.id || "") }
        ]
      }).sort({ createdAt: -1 });

      if (returnDoc) {
        const retObj = returnDoc.toObject ? returnDoc.toObject() : { ...returnDoc };
        orderObj.return = retObj;
        orderObj.activeReturn = retObj;

        const normRet = String(retObj.status || "").toLowerCase().trim();
        if (normRet === "requested") {
          orderObj.orderStatus = "Return Requested";
        } else if (normRet === "accepted" || normRet === "approved") {
          orderObj.orderStatus = "Return Approved";
        } else if (normRet === "processing" || normRet === "refund processing") {
          orderObj.orderStatus = "Refund Processing";
        } else if (normRet === "processed" || normRet === "refunded") {
          orderObj.orderStatus = "Returned & Refunded";
        } else if (normRet === "rejected") {
          orderObj.orderStatus = "Return Rejected";
        }
      }
    } catch (retErr) {
      console.warn("[trackByOrderId] Could not fetch return record:", retErr.message);
    }

    return {
      order: orderObj,
      orders: [orderObj],
      count: 1
    };
  }

  async trackOrderByUserId(userId) {
    if (!userId) {
      throw new BadRequestError("User ID is required to track orders");
    }
    const cleanId = String(userId).trim();
    const isObjectId = /^[a-f\d]{24}$/i.test(cleanId);

    let orders = [];
    if (isObjectId) {
      orders = await Order.find({ user: cleanId }).sort({ createdAt: -1 });
    }

    if (orders.length === 0) {
      const userDoc = await User.findOne({
        $or: [
          ...(isObjectId ? [{ _id: cleanId }] : []),
          { email: cleanId.toLowerCase() },
          { mobile: cleanId }
        ]
      });
      if (userDoc) {
        orders = await Order.find({ user: userDoc._id }).sort({ createdAt: -1 });
      }
    }

    if (orders.length === 0) {
      const singleOrder = await Order.findOne({
        $or: [
          { orderNumber: cleanId },
          ...(isObjectId ? [{ _id: cleanId }] : [])
        ]
      });
      if (singleOrder) {
        orders = [singleOrder];
      }
    }

    if (orders.length === 0) {
      throw new NotFoundError("No orders found for the provided User ID");
    }

    return {
      orders,
      order: orders[0],
      count: orders.length
    };
  }

  async getInvoicePdf(orderId, user) {
    const idFilter = this.getOrderLookupFilter(orderId);
    const filter = user.role === "admin"
      ? idFilter
      : { ...idFilter, user: user._id };

    const order = await Order.findOne(filter).populate("user", "name email mobile");
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    let storeInfo = null;
    try {
      const storeSettingService = require("../settings/storeSetting.service");
      storeInfo = await storeSettingService.getStoreSetting();
    } catch (e) {
      // Graceful fallback
    }

    const lines = [
      "TAX INVOICE",
      `Invoice No: ${order.invoiceNumber || order.orderNumber || order._id}`,
      `Order ID: ${order._id}`,
      `Date: ${new Date(order.createdAt).toLocaleDateString("en-IN")}`,
      `Payment Status: ${order.paymentStatus}`,
      `Payment Method: ${order.paymentMethod || "Online"}`,
      "",
      ...(storeInfo ? [
        "Store / Ship From Details:",
        `Store: ${storeInfo.storeName || "Jyotish Astro Store"}`,
        `Contact: ${storeInfo.contactName || storeInfo.fullName || "Master Astrologer"}`,
        ...(storeInfo.phone || storeInfo.mobile ? [`Phone: ${storeInfo.phone || storeInfo.mobile}`] : []),
        `Address: ${storeInfo.formattedAddress || `${storeInfo.addressLine || storeInfo.address}, ${storeInfo.city}, ${storeInfo.state} - ${storeInfo.pinCode || storeInfo.postalCode}, ${storeInfo.country || "India"}`}`,
        ""
      ] : []),
      "Customer Billing & Shipping Details:",
      `Customer: ${order.shippingAddress.fullName || order.user?.name || ""}`,
      ...(order.user?.email ? [`Email: ${order.user.email}`] : []),
      ...(order.shippingAddress.mobile || order.shippingAddress.phone || order.user?.mobile ? [`Phone: ${order.shippingAddress.mobile || order.shippingAddress.phone || order.user?.mobile}`] : []),
      `Shipping Address: ${order.shippingAddress.address}, ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.postalCode}${order.shippingAddress.country ? ', ' + order.shippingAddress.country : ''}`,
      "",
      "Items:"
    ];

    order.items.forEach((item) =>
      lines.push(`${item.name} x ${item.quantity} @ INR ${item.price.toFixed(2)} = INR ${(item.price * item.quantity).toFixed(2)}`)
    );

    lines.push(
      "",
      `Subtotal: INR ${order.subtotal.toFixed(2)}`,
      `Discount: INR ${(order.discountAmount || 0).toFixed(2)}`,
      `Shipping: INR ${order.shippingFee.toFixed(2)}`,
      `Total: INR ${order.total.toFixed(2)}`,
      `Payment: ${order.paymentStatus}`
    );

    return {
      pdf: createInvoicePdf(lines),
      filename: `${order.orderNumber || "invoice"}.pdf`
    };
  }

  async reorderItems(orderId, userId) {
    const filter = this.getOrderLookupFilter(orderId, { user: userId });
    const order = await Order.findOne(filter);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    const productIds = order.items.map((item) => item.product);
    const products = await Product.find({ _id: { $in: productIds }, active: true });
    const available = new Map(products.map((product) => [String(product._id), product]));

    for (const item of order.items) {
      const product = available.get(String(item.product));
      if (!product || product.stock < item.quantity) {
        throw new ConflictError(`${item.name} is unavailable in the required quantity`);
      }
    }

    const cart = await Cart.findOneAndUpdate(
      { user: userId },
      {
        $set: { items: order.items.map(({ product, quantity }) => ({ product, quantity })) },
        $setOnInsert: { user: userId }
      },
      { new: true, upsert: true, runValidators: true }
    );
    await cart.populate("items.product");

    return {
      cart,
      message: "Previous order items are ready in your cart. Review stock and prices before checkout."
    };
  }

  async updateOrderStatus(orderId, { status, courierName, trackingId, note, reason, rejectionReason }, adminUser) {
    const allowed = ["placed", "confirmed", "processing", "packed", "pickup_requested", "shipped", "delivered", "cancelled"];
    const normalizedStatus = String(status || "").toLowerCase().trim();
    if (!allowed.includes(normalizedStatus)) {
      throw new BadRequestError("Invalid order status");
    }

    const filter = this.getOrderLookupFilter(orderId);
    const order = await Order.findOne(filter);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    if (normalizedStatus === "cancelled" && ["shipped", "delivered"].includes(order.status)) {
      throw new ConflictError("Shipped or delivered orders cannot be cancelled.");
    }

    if (normalizedStatus === "cancelled" && order.status !== "cancelled") {
      await restoreOrderStock(order, "cancelled");
      order.stockReleasedAt = new Date();
    }

    order.status = normalizedStatus;

    if (status === "cancelled") {
      const cancelReason = rejectionReason || reason || note || "Cancelled";
      order.rejectionReason = cancelReason;
      if (adminUser) {
        order.cancelledBy = {
          adminId: adminUser._id || adminUser.id,
          name: adminUser.name || "Store Admin",
          email: adminUser.email || "admin@example.com",
          role: adminUser.role || "admin",
          reason: cancelReason,
          timestamp: new Date()
        };
      }
    }

    if (status === "confirmed") {
      if (!order.confirmedAt) {
        order.confirmedAt = new Date();
      }
      if (adminUser) {
        order.confirmedBy = {
          adminId: adminUser._id,
          name: adminUser.name || "Store Admin",
          email: adminUser.email || "admin@example.com"
        };
      }
    }

    if (status === "shipped") {
      if (courierName) {
        order.courierName = courierName;
        if (!order.shipment) order.shipment = {};
        order.shipment.provider = courierName;
      }
      if (trackingId) {
        order.trackingId = trackingId;
        if (!order.shipment) order.shipment = {};
        order.shipment.awb = trackingId;
        order.shipment.shipmentId = trackingId;
      }
      if (!order.shipment) order.shipment = {};
      order.shipment.shippedAt = new Date();
    }

    if (status === "delivered") {
      if (!order.deliveredAt) {
        order.deliveredAt = new Date();
      }
      if (order.paymentMethod === "cod" && order.paymentStatus === "pending") {
        order.paymentStatus = "paid";
        await Payment.findOneAndUpdate(
          { order: order._id },
          { status: "paid", paidAt: new Date() }
        ).catch(() => {});
      }
    } else if (order.deliveredAt && ["placed", "confirmed", "processing", "packed", "pickup_requested", "shipped"].includes(status)) {
      order.deliveredAt = null;
    }

    const eventDesc = note || (
      status === "confirmed" && adminUser ? `Order confirmed by Admin: ${adminUser.name || adminUser.email || 'Store Admin'}` :
      status === "shipped" && courierName ? `Shipped via ${courierName}${trackingId ? ' (Tracking ID: ' + trackingId + ')' : ''}` :
      status === "delivered" ? "Order delivered successfully to customer" :
      status === "processing" ? "Order is being processed and packed" :
      status === "cancelled" ? `Order cancelled${order.rejectionReason ? ': ' + order.rejectionReason : ''}` :
      `Order ${status.replaceAll("_", " ")}`
    );

    order.trackingEvents.push({
      status,
      description: eventDesc,
      occurredAt: new Date()
    });
    await order.save();

    const notificationStage = {
      placed: "confirmed",
      confirmed: "confirmed",
      processing: "processing",
      packed: "processing",
      pickup_requested: "processing",
      shipped: "shipped",
      delivered: "delivered",
      cancelled: "cancelled"
    }[status];

    if (notificationStage) {
      await notifyOrderStage(order, notificationStage, note || rejectionReason || reason).catch(() => {});
    }

    // Trigger In-App Notification to Customer
    const customerUserId = typeof order.user === "object" ? (order.user._id || order.user.id) : order.user;
    if (customerUserId) {
      let notifTitle = `Order Status: ${status.replaceAll("_", " ")}`;
      let notifMsg = `Your order #${order.orderNumber} status is now ${status.replaceAll("_", " ")}.`;

      if (status === "confirmed") {
        notifTitle = "Order Confirmed!";
        notifMsg = `Your order #${order.orderNumber} has been confirmed by our team and is being prepared.`;
      } else if (status === "shipped") {
        notifTitle = "Order Dispatched!";
        notifMsg = `Your order #${order.orderNumber} has been dispatched${order.courierName ? ' via ' + order.courierName : ''}.`;
      } else if (status === "delivered") {
        notifTitle = "Order Delivered!";
        notifMsg = `Your order #${order.orderNumber} has been delivered successfully.`;
      } else if (status === "cancelled") {
        notifTitle = "Order Cancelled";
        notifMsg = `Your order #${order.orderNumber} was cancelled.${order.rejectionReason ? ' Reason: ' + order.rejectionReason : ''}`;
      }

      InAppNotificationService.createNotification({
        userId: customerUserId,
        title: notifTitle,
        message: notifMsg,
        type: "order",
        link: `/orders/${order._id || order.orderNumber}`,
        metadata: { orderId: order._id, orderNumber: order.orderNumber, status }
      }).catch((e) => console.warn("Failed to create in-app notification:", e.message));
    }

    return order;
  }

  async updateOrderPayment(orderId, { status, transactionId }) {
    if (!["pending", "paid", "failed", "refunded"].includes(status)) {
      throw new BadRequestError("Invalid payment status");
    }

    const filter = this.getOrderLookupFilter(orderId);
    const order = await Order.findOne(filter);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    if (status === "paid" && !(await confirmOrderPayment(order))) {
      throw new ConflictError("Inventory is unavailable for this paid order; resolve manually before shipping.");
    }

    const payment = await Payment.findOneAndUpdate(
      { order: order._id },
      { status, transactionId },
      { new: true }
    );
    if (!payment) {
      throw new NotFoundError("Payment not found");
    }

    if (status !== "paid") {
      order.paymentStatus = status;
      await order.save();
      if (status === "failed" && payment.method !== "cod") {
        await restoreOrderStock(order);
      }
    }

    if (status === "paid") {
      await notifyOrderStage(order, "payment_successful").catch(() => {});
    }

    return payment;
  }

  async listAllOrders(query) {
    const pageData = parsePagination(query, 200, 1000);
    if (pageData.error) {
      throw new BadRequestError(pageData.error);
    }

    const filter = {};
    if (query.includePending !== "true") {
      filter.status = { $ne: "awaiting_payment" };
    }
    if (query.status) filter.status = query.status;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.userId) filter.user = query.userId;

    if (query.search) {
      const search = String(query.search).trim();
      filter.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { "shippingAddress.fullName": { $regex: search, $options: "i" } },
        { "shippingAddress.mobile": { $regex: search, $options: "i" } },
        { "shippingAddress.city": { $regex: search, $options: "i" } },
        { "shippingAddress.address": { $regex: search, $options: "i" } }
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("user", "name email mobile")
        .populate("items.product", "name imageUrl images price")
        .sort({ createdAt: -1 })
        .skip(pageData.skip)
        .limit(pageData.limit),
      Order.countDocuments(filter)
    ]);

    for (const order of orders) {
      await this.syncOrderPayment(order);
    }

    return {
      orders,
      pagination: formatPaginationMeta(total, pageData.page, pageData.limit)
    };
  }

  async cancelOrder(orderId, user, reason) {
    const idFilter = this.getOrderLookupFilter(orderId);
    const filter = user.role === "admin"
      ? idFilter
      : { ...idFilter, user: user._id };

    const order = await Order.findOne(filter);
    if (!order) {
      throw new NotFoundError("Order not found");
    }

    if (order.status === "cancelled") {
      throw new ConflictError("Order is already cancelled");
    }

    // Customer can only cancel when order is newly created (placed / awaiting_payment).
    // Once confirmed/processing or later, cancellation is disabled.
    if (user.role !== "admin" && !["placed", "awaiting_payment"].includes(order.status)) {
      throw new ConflictError("Order cannot be cancelled once it is confirmed or in processing. Please use the return request after delivery.");
    }

    if (["shipped", "delivered"].includes(order.status)) {
      throw new ConflictError("Shipped or delivered orders cannot be cancelled.");
    }

    await restoreOrderStock(order, "cancelled");

    // Process refund if online payment was already completed
    const payment = await Payment.findOne({ order: order._id });
    if (payment && payment.status === "paid" && payment.provider === "razorpay") {
      try {
        const { getRazorpayClient } = require("../../config/razorpay");
        const client = getRazorpayClient();
        if (payment.transactionId && !payment.transactionId.startsWith("order_test_") && !payment.transactionId.startsWith("order_sim_")) {
          await client.payments.refund(payment.transactionId, {
            amount: Math.round(order.total * 100),
            notes: { orderId: String(order._id), reason: reason || "Customer order cancellation" }
          });
        }
        payment.status = "refunded";
        await payment.save();
        order.paymentStatus = "refunded";
      } catch (refundErr) {
        console.warn("[Razorpay Cancellation Refund Note]:", refundErr.message);
        payment.status = "refunded";
        await payment.save();
        order.paymentStatus = "refunded";
      }
    }

    order.status = "cancelled";
    order.trackingEvents.push({
      status: "cancelled",
      description: reason || (user.role === "admin" ? "Order cancelled by administrator" : "Order cancelled by customer")
    });
    await order.save();

    await notifyOrderStage(order, "cancelled", reason).catch(() => {});
    return order;
  }

  getOrderStatuses() {
    return [
      { value: "placed", label: "Order Placed" },
      { value: "confirmed", label: "Confirmed" },
      { value: "processing", label: "Processing" },
      { value: "shipped", label: "Shipped" },
      { value: "delivered", label: "Delivered" },
      { value: "cancelled", label: "Cancelled" }
    ];
  }
}

module.exports = new OrdersService();


