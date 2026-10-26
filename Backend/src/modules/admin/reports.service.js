const Order = require("../../models/Order");

class ReportsService {
  /**
   * Helper to parse dates gracefully (handles YYYY-MM-DD, DD-MM-YYYY, or ISO)
   */
  parseDate(dateStr, isEndOfDay = false) {
    if (!dateStr) return null;
    let d;
    if (typeof dateStr === "string" && dateStr.includes("-")) {
      const parts = dateStr.split("-");
      if (parts[0].length === 2 && parts[2].length === 4) {
        // DD-MM-YYYY
        d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      } else {
        d = new Date(dateStr);
      }
    } else {
      d = new Date(dateStr);
    }

    if (isNaN(d.getTime())) return null;

    if (isEndOfDay) {
      d.setHours(23, 59, 59, 999);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    return d;
  }

  /**
   * Format Date to YYYY-MM-DD
   */
  formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /**
   * Format Date to DD-MM-YYYY
   */
  formatDateDisplay(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${d}-${m}-${y}`;
  }

  /**
   * Format Date to 'DD MMM' (e.g. '01 Oct')
   */
  formatShortLabel(date) {
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }

  /**
   * Extract actual event timestamps from an order
   */
  extractOrderTimestamps(order) {
    const rawStatus = String(order.status || "").toLowerCase().trim();
    const receivedAt = order.createdAt ? new Date(order.createdAt) : null;

    // Confirmed timestamp
    let confirmedAt = null;
    if (order.confirmedAt) {
      confirmedAt = new Date(order.confirmedAt);
    }
    if (!confirmedAt && Array.isArray(order.trackingEvents)) {
      const confEvt = order.trackingEvents.find((e) => e.status === "confirmed");
      if (confEvt && confEvt.occurredAt) confirmedAt = new Date(confEvt.occurredAt);
    }
    if (!confirmedAt && rawStatus === "confirmed") {
      confirmedAt = new Date(order.updatedAt || order.createdAt);
    }

    // Dispatched timestamp
    let dispatchedAt = null;
    if (order.shipment && order.shipment.shippedAt) {
      dispatchedAt = new Date(order.shipment.shippedAt);
    }
    if (!dispatchedAt && Array.isArray(order.trackingEvents)) {
      const shipEvt = order.trackingEvents.find(
        (e) => e.status === "shipped" || e.status === "dispatched" || e.status === "out_for_delivery"
      );
      if (shipEvt && shipEvt.occurredAt) dispatchedAt = new Date(shipEvt.occurredAt);
    }
    if (!dispatchedAt && (rawStatus === "shipped" || rawStatus === "dispatched" || rawStatus === "out_for_delivery")) {
      dispatchedAt = new Date(order.updatedAt || order.createdAt);
    }

    // Delivered timestamp
    let deliveredAt = null;
    if (order.deliveredAt) {
      deliveredAt = new Date(order.deliveredAt);
    }
    if (!deliveredAt && Array.isArray(order.trackingEvents)) {
      const delivEvt = order.trackingEvents.find((e) => e.status === "delivered");
      if (delivEvt && delivEvt.occurredAt) deliveredAt = new Date(delivEvt.occurredAt);
    }
    if (!deliveredAt && rawStatus === "delivered") {
      deliveredAt = new Date(order.updatedAt || order.createdAt);
    }

    // Cancelled timestamp
    let cancelledAt = null;
    if (order.stockReleasedAt) {
      cancelledAt = new Date(order.stockReleasedAt);
    }
    if (!cancelledAt && Array.isArray(order.trackingEvents)) {
      const cancelEvt = order.trackingEvents.find((e) => e.status === "cancelled");
      if (cancelEvt && cancelEvt.occurredAt) cancelledAt = new Date(cancelEvt.occurredAt);
    }
    if (!cancelledAt && rawStatus === "cancelled") {
      cancelledAt = new Date(order.updatedAt || order.createdAt);
    }

    // Return timestamp
    let returnedAt = null;
    if (Array.isArray(order.trackingEvents)) {
      const retEvt = order.trackingEvents.find(
        (e) => e.status === "returned" || e.status === "refunded" || e.status === "return_requested"
      );
      if (retEvt && retEvt.occurredAt) returnedAt = new Date(retEvt.occurredAt);
    }
    if (!returnedAt && ["returned", "return_requested", "refunded"].includes(rawStatus)) {
      returnedAt = new Date(order.updatedAt || order.createdAt);
    }

    // Mutually exclusive status flags
    const isDelivered = rawStatus === "delivered";
    const isDispatched = rawStatus === "shipped" || rawStatus === "dispatched" || rawStatus === "out_for_delivery";
    const isCancelled = rawStatus === "cancelled";
    const isReturned = ["returned", "return_requested", "refunded"].includes(rawStatus);
    const isPending = [
      "placed",
      "awaiting_payment",
      "confirmed",
      "processing",
      "packed",
      "pickup_requested"
    ].includes(rawStatus);
    const isConfirmed = rawStatus === "confirmed" || (Boolean(confirmedAt) && !isCancelled);

    const isRecognizedRevenue = !isCancelled && !isReturned && (
      order.paymentStatus === "paid" ||
      ((order.paymentMethod || "").toLowerCase() === "cod" && isDelivered)
    );

    return {
      rawStatus,
      receivedAt,
      confirmedAt,
      dispatchedAt,
      deliveredAt,
      cancelledAt,
      returnedAt,
      isDelivered,
      isDispatched,
      isCancelled,
      isReturned,
      isPending,
      isConfirmed,
      isRecognizedRevenue,
      total: Number(order.total) || 0
    };
  }

  /**
   * Main Date-wise Analytics & Reports Aggregation
   */
  async getDateWiseReport(query = {}) {
    // 1. Resolve Date Range
    let end = this.parseDate(query.endDate, true);
    if (!end) {
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }

    let start = this.parseDate(query.startDate, false);
    if (!start) {
      // Default to 10 days before end date to match common view
      start = new Date(end);
      start.setDate(start.getDate() - 9);
      start.setHours(0, 0, 0, 0);
    }

    // Ensure start is not after end
    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    const interval = (query.interval || "daily").toLowerCase();

    // 2. Calculate Previous Period for Comparisons
    const durationMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    prevStart.setHours(0, 0, 0, 0);

    // 3. Fetch All Orders that intersect either period
    // We fetch orders created since prevStart up to end, plus any order updated in this range
    const orders = await Order.find({
      $or: [
        { createdAt: { $gte: prevStart, $lte: end } },
        { updatedAt: { $gte: prevStart, $lte: end } },
        { deliveredAt: { $gte: prevStart, $lte: end } },
        { "shipment.shippedAt": { $gte: prevStart, $lte: end } }
      ]
    })
      .populate("user", "name email mobile")
      .lean();

    // 4. Build buckets for the selected interval in the current period [start, end]
    const buckets = [];
    const bucketMap = new Map();

    if (interval === "weekly") {
      let cur = new Date(start);
      while (cur <= end) {
        const bStart = new Date(cur);
        const bEnd = new Date(cur);
        bEnd.setDate(bEnd.getDate() + 6);
        bEnd.setHours(23, 59, 59, 999);
        if (bEnd > end) bEnd.setTime(end.getTime());

        const key = this.formatDateKey(bStart);
        const label = `Week of ${this.formatShortLabel(bStart)}`;
        const bucket = {
          key,
          label,
          start: bStart,
          end: bEnd,
          ordersReceived: 0,
          ordersConfirmed: 0,
          ordersDispatched: 0,
          ordersDelivered: 0,
          ordersCancelled: 0,
          ordersPending: 0,
          salesAmount: 0,
          cancelledAmount: 0
        };
        buckets.push(bucket);
        bucketMap.set(key, bucket);

        cur.setDate(cur.getDate() + 7);
      }
    } else if (interval === "monthly") {
      let cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= end) {
        const bStart = new Date(cur);
        const bEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59, 999);
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
        const label = cur.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
        const bucket = {
          key,
          label,
          start: bStart,
          end: bEnd,
          ordersReceived: 0,
          ordersConfirmed: 0,
          ordersDispatched: 0,
          ordersDelivered: 0,
          ordersCancelled: 0,
          ordersPending: 0,
          salesAmount: 0,
          cancelledAmount: 0
        };
        buckets.push(bucket);
        bucketMap.set(key, bucket);

        cur.setMonth(cur.getMonth() + 1);
      }
    } else if (interval === "yearly") {
      let curYear = start.getFullYear();
      const endYear = end.getFullYear();
      while (curYear <= endYear) {
        const bStart = new Date(curYear, 0, 1);
        const bEnd = new Date(curYear, 11, 31, 23, 59, 59, 999);
        const key = String(curYear);
        const label = String(curYear);
        const bucket = {
          key,
          label,
          start: bStart,
          end: bEnd,
          ordersReceived: 0,
          ordersConfirmed: 0,
          ordersDispatched: 0,
          ordersDelivered: 0,
          ordersCancelled: 0,
          ordersPending: 0,
          salesAmount: 0,
          cancelledAmount: 0
        };
        buckets.push(bucket);
        bucketMap.set(key, bucket);
        curYear++;
      }
    } else {
      // Default: daily buckets
      let cur = new Date(start);
      while (cur <= end) {
        const key = this.formatDateKey(cur);
        const bStart = new Date(cur);
        bStart.setHours(0, 0, 0, 0);
        const bEnd = new Date(cur);
        bEnd.setHours(23, 59, 59, 999);

        const bucket = {
          key,
          label: this.formatShortLabel(cur),
          displayDate: this.formatDateDisplay(cur),
          start: bStart,
          end: bEnd,
          ordersReceived: 0,
          ordersConfirmed: 0,
          ordersDispatched: 0,
          ordersDelivered: 0,
          ordersCancelled: 0,
          ordersPending: 0,
          salesAmount: 0,
          cancelledAmount: 0
        };
        buckets.push(bucket);
        bucketMap.set(key, bucket);

        cur.setDate(cur.getDate() + 1);
      }
    }

    // 5. Build daily breakdown map for detailed table (always daily regardless of chart interval)
    const dailyTableMap = new Map();
    let curDay = new Date(start);
    while (curDay <= end) {
      const key = this.formatDateKey(curDay);
      dailyTableMap.set(key, {
        rawDate: key,
        date: this.formatDateDisplay(curDay),
        shortLabel: this.formatShortLabel(curDay),
        ordersReceived: 0,
        confirmed: 0,
        dispatched: 0,
        delivered: 0,
        cancelled: 0,
        pending: 0,
        salesAmount: 0,
        cancelledAmount: 0
      });
      curDay.setDate(curDay.getDate() + 1);
    }

    // 6. Aggregate Current Period and Previous Period Summary
    let currentSummary = {
      totalOrders: 0,
      ordersReceived: 0,
      ordersConfirmed: 0,
      ordersDispatched: 0,
      ordersDelivered: 0,
      cancelledOrders: 0,
      pendingOrders: 0,
      totalSales: 0,
      cancelledAmount: 0
    };

    let prevSummary = {
      totalOrders: 0,
      ordersReceived: 0,
      ordersConfirmed: 0,
      ordersDispatched: 0,
      ordersDelivered: 0,
      cancelledOrders: 0,
      pendingOrders: 0,
      totalSales: 0,
      cancelledAmount: 0
    };

    let statusCounts = {
      delivered: 0,
      dispatched: 0,
      pending: 0,
      cancelled: 0,
      returned: 0
    };

    // Process all orders
    for (const order of orders) {
      const ts = this.extractOrderTimestamps(order);

      // --- CURRENT PERIOD ACTIVITY CHECK ---
      const isReceivedInCurrent = ts.receivedAt && ts.receivedAt >= start && ts.receivedAt <= end;

      // 1. Received / Placed
      if (isReceivedInCurrent) {
        currentSummary.totalOrders++;
        currentSummary.ordersReceived++;
        if (ts.isRecognizedRevenue) {
          currentSummary.totalSales += ts.total;
        }

        const dayKey = this.formatDateKey(ts.receivedAt);
        if (dailyTableMap.has(dayKey)) {
          const row = dailyTableMap.get(dayKey);
          row.ordersReceived++;
          if (ts.isRecognizedRevenue) row.salesAmount += ts.total;
        }

        for (const bucket of buckets) {
          if (ts.receivedAt >= bucket.start && ts.receivedAt <= bucket.end) {
            bucket.ordersReceived++;
            if (ts.isRecognizedRevenue) bucket.salesAmount += ts.total;
            break;
          }
        }
      }

      // 2. Confirmed (if active confirmed status and not cancelled)
      const isConfirmedInCurrent = ts.isConfirmed && (
        (ts.confirmedAt && ts.confirmedAt >= start && ts.confirmedAt <= end) ||
        isReceivedInCurrent
      );
      if (isConfirmedInCurrent) {
        currentSummary.ordersConfirmed++;
        const confDate = (ts.confirmedAt && ts.confirmedAt >= start && ts.confirmedAt <= end)
          ? ts.confirmedAt
          : ts.receivedAt;
        if (confDate) {
          const dayKey = this.formatDateKey(confDate);
          if (dailyTableMap.has(dayKey)) {
            dailyTableMap.get(dayKey).confirmed++;
          }
          for (const bucket of buckets) {
            if (confDate >= bucket.start && confDate <= bucket.end) {
              bucket.ordersConfirmed++;
              break;
            }
          }
        }
      }

      // 3. Dispatched (ONLY if order CURRENTLY in dispatched status)
      // When order progresses to delivered, isDispatched is false, so dispatched decrements!
      const isDispatchedInCurrent = ts.isDispatched && (
        (ts.dispatchedAt && ts.dispatchedAt >= start && ts.dispatchedAt <= end) ||
        isReceivedInCurrent
      );
      if (isDispatchedInCurrent) {
        currentSummary.ordersDispatched++;
        const shipDate = (ts.dispatchedAt && ts.dispatchedAt >= start && ts.dispatchedAt <= end)
          ? ts.dispatchedAt
          : ts.receivedAt;
        if (shipDate) {
          const dayKey = this.formatDateKey(shipDate);
          if (dailyTableMap.has(dayKey)) {
            dailyTableMap.get(dayKey).dispatched++;
          }
          for (const bucket of buckets) {
            if (shipDate >= bucket.start && shipDate <= bucket.end) {
              bucket.ordersDispatched++;
              break;
            }
          }
        }
      }

      // 4. Delivered (ONLY if order CURRENTLY in delivered status)
      // When status changes to returned/cancelled/shipped, isDelivered is false, so delivered decrements!
      const isDeliveredInCurrent = ts.isDelivered && (
        (ts.deliveredAt && ts.deliveredAt >= start && ts.deliveredAt <= end) ||
        isReceivedInCurrent
      );
      if (isDeliveredInCurrent) {
        currentSummary.ordersDelivered++;
        const delivDate = (ts.deliveredAt && ts.deliveredAt >= start && ts.deliveredAt <= end)
          ? ts.deliveredAt
          : ts.receivedAt;
        if (delivDate) {
          const dayKey = this.formatDateKey(delivDate);
          if (dailyTableMap.has(dayKey)) {
            dailyTableMap.get(dayKey).delivered++;
          }
          for (const bucket of buckets) {
            if (delivDate >= bucket.start && delivDate <= bucket.end) {
              bucket.ordersDelivered++;
              break;
            }
          }
        }
      }

      // 5. Cancelled (ONLY if order CURRENTLY in cancelled status)
      const isCancelledInCurrent = ts.isCancelled && (
        (ts.cancelledAt && ts.cancelledAt >= start && ts.cancelledAt <= end) ||
        isReceivedInCurrent
      );
      if (isCancelledInCurrent) {
        currentSummary.cancelledOrders++;
        currentSummary.cancelledAmount += ts.total;
        const cancelDate = (ts.cancelledAt && ts.cancelledAt >= start && ts.cancelledAt <= end)
          ? ts.cancelledAt
          : ts.receivedAt;
        if (cancelDate) {
          const dayKey = this.formatDateKey(cancelDate);
          if (dailyTableMap.has(dayKey)) {
            const row = dailyTableMap.get(dayKey);
            row.cancelled++;
            row.cancelledAmount += ts.total;
          }
          for (const bucket of buckets) {
            if (cancelDate >= bucket.start && cancelDate <= bucket.end) {
              bucket.ordersCancelled++;
              bucket.cancelledAmount += ts.total;
              break;
            }
          }
        }
      }

      // 6. Pending (ONLY if order CURRENTLY in pending status)
      const isPendingInCurrent = ts.isPending && isReceivedInCurrent;
      if (isPendingInCurrent) {
        currentSummary.pendingOrders++;
        if (ts.receivedAt) {
          const dayKey = this.formatDateKey(ts.receivedAt);
          if (dailyTableMap.has(dayKey)) {
            dailyTableMap.get(dayKey).pending++;
          }
          for (const bucket of buckets) {
            if (ts.receivedAt >= bucket.start && ts.receivedAt <= bucket.end) {
              bucket.ordersPending++;
              break;
            }
          }
        }
      }

      // 7. Status Counts for Donut Chart (Mutually exclusive status for orders in period)
      if (isReceivedInCurrent || isDeliveredInCurrent || isDispatchedInCurrent || isCancelledInCurrent) {
        if (ts.isDelivered) {
          statusCounts.delivered++;
        } else if (ts.isDispatched) {
          statusCounts.dispatched++;
        } else if (ts.isCancelled) {
          statusCounts.cancelled++;
        } else if (ts.isReturned) {
          statusCounts.returned++;
        } else {
          statusCounts.pending++;
        }
      }

      // --- PREVIOUS PERIOD CHECK ---
      const isReceivedInPrev = ts.receivedAt && ts.receivedAt >= prevStart && ts.receivedAt <= prevEnd;
      const isConfirmedInPrev = ts.isConfirmed && (
        (ts.confirmedAt && ts.confirmedAt >= prevStart && ts.confirmedAt <= prevEnd) ||
        isReceivedInPrev
      );
      const isDispatchedInPrev = ts.isDispatched && (
        (ts.dispatchedAt && ts.dispatchedAt >= prevStart && ts.dispatchedAt <= prevEnd) ||
        isReceivedInPrev
      );
      const isDeliveredInPrev = ts.isDelivered && (
        (ts.deliveredAt && ts.deliveredAt >= prevStart && ts.deliveredAt <= prevEnd) ||
        isReceivedInPrev
      );
      const isCancelledInPrev = ts.isCancelled && (
        (ts.cancelledAt && ts.cancelledAt >= prevStart && ts.cancelledAt <= prevEnd) ||
        isReceivedInPrev
      );
      const isPendingInPrev = ts.isPending && isReceivedInPrev;

      if (isReceivedInPrev) {
        prevSummary.totalOrders++;
        prevSummary.ordersReceived++;
        if (ts.isRecognizedRevenue) prevSummary.totalSales += ts.total;
      }
      if (isConfirmedInPrev) {
        prevSummary.ordersConfirmed++;
      }
      if (isDispatchedInPrev) {
        prevSummary.ordersDispatched++;
      }
      if (isDeliveredInPrev) {
        prevSummary.ordersDelivered++;
      }
      if (isCancelledInPrev) {
        prevSummary.cancelledOrders++;
        prevSummary.cancelledAmount += ts.total;
      }
      if (isPendingInPrev) {
        prevSummary.pendingOrders++;
      }
    }

    // 7. Calculate Percentage Changes
    const calcChange = (curr, prev) => {
      if (prev === null || prev === undefined || prev === 0) {
        return curr > 0 ? 100 : 0;
      }
      return Math.round(((curr - prev) / prev) * 100);
    };

    const cancellationRate =
      currentSummary.totalOrders > 0
        ? Number(((currentSummary.cancelledOrders / currentSummary.totalOrders) * 100).toFixed(1))
        : 0;

    const prevCancellationRate =
      prevSummary.totalOrders > 0
        ? Number(((prevSummary.cancelledOrders / prevSummary.totalOrders) * 100).toFixed(1))
        : 0;

    const comparison = {
      hasPreviousData: prevSummary.totalOrders > 0 || prevSummary.totalSales > 0,
      totalSalesChangePct: calcChange(currentSummary.totalSales, prevSummary.totalSales),
      totalOrdersChangePct: calcChange(currentSummary.totalOrders, prevSummary.totalOrders),
      ordersDispatchedChangePct: calcChange(currentSummary.ordersDispatched, prevSummary.ordersDispatched),
      ordersDeliveredChangePct: calcChange(currentSummary.ordersDelivered, prevSummary.ordersDelivered),
      ordersCancelledChangePct: calcChange(currentSummary.cancelledOrders, prevSummary.cancelledOrders),
      ordersPendingChangePct: calcChange(currentSummary.pendingOrders, prevSummary.pendingOrders),
      cancellationRateChangePct: Number((cancellationRate - prevCancellationRate).toFixed(1)),
      previousPeriod: {
        startDate: this.formatDateKey(prevStart),
        endDate: this.formatDateKey(prevEnd),
        ...prevSummary
      }
    };

    // 8. Order Status Distribution for Donut Chart (Mutually Exclusive Statuses)
    const totalStatusOrders =
      statusCounts.delivered +
      statusCounts.dispatched +
      statusCounts.cancelled +
      statusCounts.pending +
      statusCounts.returned;

    const baseTotal = totalStatusOrders > 0 ? totalStatusOrders : (currentSummary.totalOrders || 1);
    const calcPct = (count) => (baseTotal > 0 ? Number(((count / baseTotal) * 100).toFixed(1)) : 0);

    const distributionItems = [
      {
        status: "delivered",
        label: "Delivered",
        count: statusCounts.delivered,
        percentage: calcPct(statusCounts.delivered),
        color: "#10B981"
      },
      {
        status: "dispatched",
        label: "Dispatched",
        count: statusCounts.dispatched,
        percentage: calcPct(statusCounts.dispatched),
        color: "#F59E0B"
      },
      {
        status: "pending",
        label: "Pending",
        count: statusCounts.pending,
        percentage: calcPct(statusCounts.pending),
        color: "#A855F7"
      },
      {
        status: "cancelled",
        label: "Cancelled",
        count: statusCounts.cancelled,
        percentage: calcPct(statusCounts.cancelled),
        color: "#EF4444"
      }
    ];

    if (statusCounts.returned > 0) {
      distributionItems.push({
        status: "returned",
        label: "Returned",
        count: statusCounts.returned,
        percentage: calcPct(statusCounts.returned),
        color: "#38BDF8"
      });
    }

    const statusDistribution = {
      total: totalStatusOrders > 0 ? totalStatusOrders : currentSummary.totalOrders,
      items: distributionItems
    };

    // 9. Format Detailed Rows (Sorted Newest Date First)
    const detailedRows = Array.from(dailyTableMap.values()).sort(
      (a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime()
    );

    // 10. Format Trend Series for Main Graph
    const trendSeries = {
      categories: buckets.map((b) => b.label),
      rawDates: buckets.map((b) => b.key),
      ordersReceived: buckets.map((b) => b.ordersReceived),
      ordersConfirmed: buckets.map((b) => b.ordersConfirmed),
      ordersDispatched: buckets.map((b) => b.ordersDispatched),
      ordersDelivered: buckets.map((b) => b.ordersDelivered),
      ordersCancelled: buckets.map((b) => b.ordersCancelled),
      salesAmount: buckets.map((b) => Math.round(b.salesAmount * 100) / 100)
    };

    return {
      period: {
        startDate: this.formatDateKey(start),
        endDate: this.formatDateKey(end),
        displayStart: this.formatDateDisplay(start),
        displayEnd: this.formatDateDisplay(end),
        interval
      },
      summary: {
        totalSalesRevenue: Math.round(currentSummary.totalSales * 100) / 100,
        totalOrders: currentSummary.totalOrders,
        ordersReceived: currentSummary.ordersReceived,
        ordersConfirmed: currentSummary.ordersConfirmed,
        ordersDispatched: currentSummary.ordersDispatched,
        ordersDelivered: currentSummary.ordersDelivered,
        cancelledOrders: currentSummary.cancelledOrders,
        pendingOrders: currentSummary.pendingOrders,
        cancellationRate,
        cancelledAmount: Math.round(currentSummary.cancelledAmount * 100) / 100,
        comparison
      },
      trendSeries,
      statusDistribution,
      detailedRows
    };
  }

  /**
   * Drill-down: Get detailed orders active on or matching events on a given date
   */
  async getDateWiseOrders(query = {}) {
    const { date, status } = query;
    if (!date) {
      throw new Error("Date is required for drill-down order details");
    }

    const targetDate = this.parseDate(date);
    if (!targetDate) {
      throw new Error("Invalid date format. Expected YYYY-MM-DD or DD-MM-YYYY");
    }

    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const filter = {
      $or: [
        { createdAt: { $gte: dayStart, $lte: dayEnd } },
        { updatedAt: { $gte: dayStart, $lte: dayEnd } },
        { deliveredAt: { $gte: dayStart, $lte: dayEnd } },
        { "shipment.shippedAt": { $gte: dayStart, $lte: dayEnd } }
      ]
    };

    if (status && status !== "all") {
      if (status === "shipped" || status === "dispatched") {
        filter.status = { $in: ["shipped", "dispatched", "out_for_delivery"] };
      } else {
        filter.status = status;
      }
    }

    const orders = await Order.find(filter)
      .populate("user", "name email mobile")
      .populate("items.product", "name sku imageUrl")
      .sort({ createdAt: -1 })
      .lean();

    return {
      date: this.formatDateDisplay(dayStart),
      rawDate: this.formatDateKey(dayStart),
      count: orders.length,
      orders: orders.map((o) => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        customerName: o.shippingAddress?.fullName || o.user?.name || "Customer",
        customerEmail: o.shippingAddress?.email || o.user?.email || "",
        customerMobile: o.shippingAddress?.mobile || o.user?.mobile || "",
        itemsCount: Array.isArray(o.items) ? o.items.reduce((s, i) => s + (i.quantity || 1), 0) : 0,
        itemsSummary: Array.isArray(o.items) ? o.items.map((i) => `${i.name} (x${i.quantity})`).join(", ") : "",
        total: o.total,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod || "Online",
        createdAt: o.createdAt,
        deliveredAt: o.deliveredAt,
        shippedAt: o.shipment?.shippedAt,
        courierName: o.courierName || o.shipment?.provider || "",
        trackingId: o.trackingId || o.shipment?.awb || ""
      }))
    };
  }
}

module.exports = new ReportsService();
