/**
 * High-Performance In-Memory Cache Service
 * Provides TTL-based expiration, prefix-based invalidation, and metrics tracking.
 */

class CacheService {
  constructor(maxItems = 2000) {
    this.store = new Map();
    this.maxItems = maxItems;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0
    };
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  set(key, value, ttlSeconds = 120) {
    if (this.store.size >= this.maxItems) {
      // Evict oldest entry (FIFO)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }

    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, {
      value,
      expiresAt,
      createdAt: Date.now(),
      ttlSeconds
    });
    this.stats.sets++;
    return true;
  }

  has(key) {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  del(key) {
    return this.store.delete(key);
  }

  invalidatePrefix(prefix) {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    this.stats.invalidations += count;
    return count;
  }

  flush() {
    const count = this.store.size;
    this.store.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0
    };
    return count;
  }

  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRatio = totalRequests > 0 ? (this.stats.hits / totalRequests) : 0;
    return {
      keysCount: this.store.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      invalidations: this.stats.invalidations,
      hitRatio: Math.round(hitRatio * 1000) / 1000
    };
  }
}

const cacheService = new CacheService();

module.exports = {
  CacheService,
  cacheService
};
