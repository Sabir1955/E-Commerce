/**
 * Performance Profiler & Latency Monitoring Middleware
 * Measures request processing duration, appends X-Response-Time header,
 * monitors slow endpoints, and collects rolling performance metrics.
 */

class LatencyTracker {
  constructor(slowThresholdMs = 500) {
    this.slowThresholdMs = slowThresholdMs;
    this.reset();
  }

  reset() {
    this.totalRequests = 0;
    this.totalTimeMs = 0;
    this.minTimeMs = null;
    this.maxTimeMs = 0;
    this.slowRequests = 0;
    this.recentSlowRequests = [];
  }

  record(durationMs, method, url) {
    this.totalRequests++;
    this.totalTimeMs += durationMs;

    if (this.minTimeMs === null || durationMs < this.minTimeMs) {
      this.minTimeMs = Number(durationMs.toFixed(2));
    }
    if (durationMs > this.maxTimeMs) {
      this.maxTimeMs = Number(durationMs.toFixed(2));
    }

    if (durationMs >= this.slowThresholdMs) {
      this.slowRequests++;
      this.recentSlowRequests.unshift({
        method,
        url,
        durationMs: Number(durationMs.toFixed(2)),
        timestamp: new Date().toISOString()
      });
      if (this.recentSlowRequests.length > 20) {
        this.recentSlowRequests.pop();
      }

      if (process.env.NODE_ENV !== "test") {
        console.warn(`[PERF WARNING] Slow Request detected: ${method} ${url} took ${durationMs.toFixed(2)}ms (threshold: ${this.slowThresholdMs}ms)`);
      }
    }
  }

  getMetrics() {
    const avg = this.totalRequests > 0 ? Number((this.totalTimeMs / this.totalRequests).toFixed(2)) : 0;
    return {
      totalRequests: this.totalRequests,
      avgLatencyMs: avg,
      minLatencyMs: this.minTimeMs || 0,
      maxLatencyMs: this.maxTimeMs,
      slowRequestsCount: this.slowRequests,
      slowThresholdMs: this.slowThresholdMs,
      recentSlowRequests: [...this.recentSlowRequests]
    };
  }
}

const latencyTracker = new LatencyTracker();

function profilerMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  let headersSent = false;

  // Intercept writeHead to set X-Response-Time before headers are flushed
  const originalWriteHead = res.writeHead;
  res.writeHead = function (...args) {
    if (!headersSent) {
      headersSent = true;
      const end = process.hrtime.bigint();
      const elapsedMs = Number(end - start) / 1e6;
      res.setHeader("X-Response-Time", `${elapsedMs.toFixed(2)}ms`);
    }
    return originalWriteHead.apply(this, args);
  };

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    latencyTracker.record(durationMs, req.method, req.originalUrl || req.url);
  });

  next();
}

module.exports = {
  LatencyTracker,
  latencyTracker,
  profilerMiddleware,
  getLatencyMetrics: () => latencyTracker.getMetrics(),
  resetLatencyMetrics: () => latencyTracker.reset()
};
