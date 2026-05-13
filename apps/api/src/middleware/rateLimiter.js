/**
 * Rate Limiting Middleware for Zsiistant API
 * Implements per-IP and per-API key rate limiting with configurable windows
 */

import { createHash } from 'node:crypto';

/**
 * Rate limiter configuration
 * Can be customized via environment variables or settings
 */
const DEFAULT_CONFIG = {
  // Per-IP rate limiting
  ipWindowMs: 15 * 60 * 1000, // 15 minutes
  ipMaxRequests: 100, // max requests per IP per window

  // Per-API key rate limiting  
  apiKeyWindowMs: 60 * 1000, // 1 minute
  apiKeyMaxRequests: 60, // max requests per API key per window

  // Store for rate limit data
  cleanupIntervalMs: 5 * 60 * 1000, // cleanup old entries every 5 minutes

  // Skip rate limiting for health endpoint
  skipPaths: ['/health', '/healthz']
};

/**
 * In-memory store for rate limit data
 * Structure: { ip: { count: number, resetTime: number }, apiKey: { count: number, resetTime: number } }
 */
const rateLimitStore = new Map();

/**
 * Cleanup function to remove expired entries
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

// Start cleanup interval
setInterval(cleanupExpiredEntries, DEFAULT_CONFIG.cleanupIntervalMs);

/**
 * Generate a unique key for rate limiting
 * @param {string} type - 'ip' or 'apiKey'
 * @param {string} identifier - IP address or API key
 * @returns {string} Unique rate limit key
 */
function getRateLimitKey(type, identifier) {
  return `${type}:${identifier}`;
}

/**
 * Create a standardized rate limit error response
 * @param {number} retryAfter - Seconds until reset
 * @param {string} type - Rate limit type (ip or apiKey)
 * @returns {Object} Error response object
 */
function createRateLimitError(retryAfter, type) {
  return {
    error: {
      message: `Rate limit exceeded for ${type}`,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: retryAfter,
      type: type,
      timestamp: Date.now()
    },
    success: false
  };
}

/**
 * Rate limiting middleware factory
 * @param {Object} config - Rate limiter configuration
 * @returns {Function} Express-style middleware function
 */
function createRateLimiter(config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async (req, res, next) => {
    try {
      // Skip rate limiting for health endpoints
      if (finalConfig.skipPaths.some(path => req.path.startsWith(path))) {
        return next();
      }

      const now = Date.now();
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      
      // Normalize IPv6 addresses
      const normalizedIp = clientIp.includes(':') ? `[${clientIp}]` : clientIp;

      // Check for API key in headers
      const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');
      const ipKey = getRateLimitKey('ip', normalizedIp);
      
      let ipData = rateLimitStore.get(ipKey);
      let apiKeyKey = null;
      let apiKeyData = null;

      // Initialize or update IP rate limit data
      if (!ipData || ipData.resetTime < now) {
        ipData = { count: 1, resetTime: now + finalConfig.ipWindowMs };
        rateLimitStore.set(ipKey, ipData);
      } else {
        ipData.count++;
      }

      // Check API key rate limiting if API key is present
      if (apiKey) {
        apiKeyKey = getRateLimitKey('apiKey', apiKey);
        apiKeyData = rateLimitStore.get(apiKeyKey);

        if (!apiKeyData || apiKeyData.resetTime < now) {
          apiKeyData = { count: 1, resetTime: now + finalConfig.apiKeyWindowMs };
          rateLimitStore.set(apiKeyKey, apiKeyData);
        } else {
          apiKeyData.count++;
        }
      }

      // Check if limits are exceeded
      const ipRetryAfter = Math.ceil((ipData.resetTime - now) / 1000);
      const apiKeyRetryAfter = apiKeyData ? Math.ceil((apiKeyData.resetTime - now) / 1000) : null;

      // Return rate limit headers
      res.setHeader('X-RateLimit-Limit', apiKey ? Math.min(finalConfig.ipMaxRequests, finalConfig.apiKeyMaxRequests) : finalConfig.ipMaxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, (apiKey ? Math.min(finalConfig.ipMaxRequests, finalConfig.apiKeyMaxRequests) : finalConfig.ipMaxRequests) - (apiKey ? Math.min(ipData.count, apiKeyData.count) : ipData.count)));
      res.setHeader('X-RateLimit-Reset', Math.floor(ipData.resetTime / 1000));

      // Check IP rate limit
      if (ipData.count > finalConfig.ipMaxRequests) {
        return res.status(429).json(createRateLimitError(ipRetryAfter, 'ip'));
      }

      // Check API key rate limit (if applicable)
      if (apiKey && apiKeyData && apiKeyData.count > finalConfig.apiKeyMaxRequests) {
        return res.status(429).json(createRateLimitError(apiKeyRetryAfter, 'apiKey'));
      }

      // Continue to next middleware
      next();

    } catch (error) {
      console.error('Rate limiter error:', error);
      // If rate limiter fails, allow request to continue
      next();
    }
  };
}

/**
 * Get current rate limit status for a given identifier
 * @param {string} type - 'ip' or 'apiKey'
 * @param {string} identifier - IP address or API key
 * @returns {Object} Rate limit status
 */
function getRateLimitStatus(type, identifier) {
  const key = getRateLimitKey(type, identifier);
  const data = rateLimitStore.get(key);
  
  if (!data) {
    return {
      count: 0,
      limit: type === 'ip' ? DEFAULT_CONFIG.ipMaxRequests : DEFAULT_CONFIG.apiKeyMaxRequests,
      remaining: type === 'ip' ? DEFAULT_CONFIG.ipMaxRequests : DEFAULT_CONFIG.apiKeyMaxRequests,
      reset: null
    };
  }

  return {
    count: data.count,
    limit: type === 'ip' ? DEFAULT_CONFIG.ipMaxRequests : DEFAULT_CONFIG.apiKeyMaxRequests,
    remaining: Math.max(0, (type === 'ip' ? DEFAULT_CONFIG.ipMaxRequests : DEFAULT_CONFIG.apiKeyMaxRequests) - data.count),
    reset: data.resetTime
  };
}

/**
 * Reset rate limits for a given identifier (admin function)
 * @param {string} type - 'ip' or 'apiKey'
 * @param {string} identifier - IP address or API key
 * @returns {boolean} True if reset was successful
 */
function resetRateLimit(type, identifier) {
  const key = getRateLimitKey(type, identifier);
  return rateLimitStore.delete(key);
}

/**
 * Get overall rate limiter statistics
 * @returns {Object} Statistics about rate limiter
 */
function getRateLimitStats() {
  return {
    totalEntries: rateLimitStore.size,
    ipEntries: Array.from(rateLimitStore.keys()).filter(key => key.startsWith('ip:')).length,
    apiKeyEntries: Array.from(rateLimitStore.keys()).filter(key => key.startsWith('apiKey:')).length,
    config: DEFAULT_CONFIG
  };
}

export {
  createRateLimiter,
  getRateLimitStatus,
  resetRateLimit,
  getRateLimitStats,
  rateLimitStore
};

// Export default for common usage
export default createRateLimiter;