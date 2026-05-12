/**
 * Rate Limiter - Handles request rate limiting and DoS protection
 */

import { createHash } from 'node:crypto';

/**
 * Enhanced Rate Limiter with security features
 */
export class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60 * 1000; // 1 minute
    this.maxRequests = options.maxRequests || 60;
    this.maxConcurrentConnections = options.maxConcurrentConnections || 100;
    this.maxRateLimitEntries = options.maxRateLimitEntries || 5000;
    this.maxRequestSize = options.maxRequestSize || 1024 * 1024; // 1MB
    this.maxConnectionsPerIP = options.maxConnectionsPerIP || 20;
    this.maxConcurrentTotal = options.maxConcurrentTotal || 1000;
    this.maxRequestTimeout = options.maxRequestTimeout || 30000;
    
    this.rateLimit = new Map();
    this.activeConnections = new Map();
    this.totalActiveConnections = 0;
    this.messageTimestamps = new Map();
    
    this.blockedIPs = new Set();
    this.ipViolationCounts = new Map();
    this.blockThreshold = options.blockThreshold || 50;
    this.blockDuration = options.blockDuration || 30 * 60 * 1000; // 30 minutes
    this.ipCleanupInterval = options.ipCleanupInterval || 15 * 60 * 1000; // 15 minutes
    
    this.connCleanupInterval = 5 * 60 * 1000; // 5 minutes
    this.rateLimitCleanupInterval = null;
    
    // Start cleanup intervals
    this.startCleanupIntervals();
  }

  /**
   * Check if a request is allowed based on rate limiting
   */
  isAllowed(clientIP, request) {
    try {
      // Validate client IP format
      if (!clientIP || clientIP === 'unknown') {
        return { allowed: false, reason: 'Invalid Client IP' };
      }
      
      // Check if IP is already blocked
      if (this.isBlockedIP(clientIP)) {
        return { allowed: false, reason: 'IP Blocked', retryAfter: Math.ceil(this.blockDuration / 1000) };
      }
      
      // Clean up old entries more efficiently
      this.cleanupRateLimitEntries();
      
      // Create secure rate limit key
      const rateLimitKey = this.createRateLimitKey(clientIP);
      
      // Check if IP is rate limited
      if (this.rateLimit.has(rateLimitKey)) {
        const data = this.rateLimit.get(rateLimitKey);
        const now = Date.now();
        
        if (now - data.timestamp < this.windowMs && data.count >= this.maxRequests) {
          return { 
            allowed: false, 
            reason: 'Rate Limit Exceeded',
            retryAfter: Math.ceil((this.windowMs - (now - data.timestamp)) / 1000)
          };
        }
        
        // Increment count with bounds checking
        data.count = Math.min(data.count + 1, this.maxRequests);
        data.timestamp = now;
        data.userAgent = (request.headers['user-agent'] || '').substring(0, 500);
      } else {
        // Create new entry with validation and bounds checking
        const now = Date.now();
        const userAgent = (request.headers['user-agent'] || '').length > 500 
          ? request.headers['user-agent'].substring(0, 500) 
          : request.headers['user-agent'] || '';
        
        this.rateLimit.set(rateLimitKey, { 
          count: 1, 
          timestamp: now, 
          userAgent: userAgent 
        });
      }
      
      return { allowed: true };
    } catch (err) {
      console.error('Rate limit error:', err);
      return { allowed: false, reason: 'Internal Server Error' };
    }
  }

  /**
   * Create rate limit key with IP hashing for privacy
   */
  createRateLimitKey(clientIP, timestamp) {
    // Hash the IP for better privacy and security
    const ipHash = createHash('sha256').update(clientIP).digest('hex').substring(0, 16);
    const windowStart = Math.floor(timestamp / this.windowMs) * this.windowMs;
    return `${ipHash}:${windowStart}`;
  }

  /**
   * Check if IP is blocked
   */
  isBlockedIP(ip) {
    return this.blockedIPs.has(ip);
  }

  /**
   * Record IP violation and potentially block IP
   */
  recordIPViolation(ip) {
    const now = Date.now();
    const count = (this.ipViolationCounts.get(ip) || 0) + 1;
    this.ipViolationCounts.set(ip, count);
    
    // Block IP if threshold exceeded
    if (count >= this.blockThreshold) {
      this.blockedIPs.add(ip);
      // Schedule unblocking
      setTimeout(() => {
        this.blockedIPs.delete(ip);
        this.ipViolationCounts.delete(ip);
      }, this.blockDuration);
      console.log(`IP ${ip} blocked due to ${count} violations`);
    }
  }

  /**
   * Clean up old rate limit entries
   */
  cleanupRateLimitEntries() {
    const now = Date.now();
    const keysToDelete = [];
    
    // First pass: collect old entries
    for (const [key, data] of this.rateLimit.entries()) {
      if (now - data.timestamp > this.windowMs) {
        keysToDelete.push(key);
      }
    }
    
    // Delete old entries in batch with security logging
    if (keysToDelete.length > 0) {
      console.log(`Cleaning up ${keysToDelete.length} expired rate limit entries`);
      for (const key of keysToDelete) {
        this.rateLimit.delete(key);
      }
    }
    
    // If we still have too many entries, enforce hard limit with more aggressive cleanup
    if (this.rateLimit.size > this.maxRateLimitEntries) {
      // Sort by timestamp (most recent first)
      const sortedEntries = Array.from(this.rateLimit.entries())
        .sort((a, b) => b[1].timestamp - a[1].timestamp);
      
      // Clear the map and repopulate with only the most recent entries
      const oldSize = this.rateLimit.size;
      this.rateLimit.clear();
      const entriesToKeep = sortedEntries.slice(0, this.maxRateLimitEntries / 2); // Keep 50% of capacity
      
      for (const [key, data] of entriesToKeep) {
        this.rateLimit.set(key, data);
      }
      
      console.log(`Rate limit memory optimization: removed ${oldSize - entriesToKeep.length} entries to stay under limit (${this.rateLimit.size} remaining)`);
    }
  }

  /**
   * Clean up IP tracking
   */
  cleanupIPTracking() {
    const now = Date.now();
    for (const [ip, lastViolation] of this.ipViolationCounts.entries()) {
      if (now - lastViolation > this.blockDuration) {
        this.ipViolationCounts.delete(ip);
      }
    }
  }

  /**
   * Clean up old connections
   */
  cleanupOldConnections() {
    const now = Date.now();
    const CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    const keysToDelete = [];
    
    // Clean up old connections
    for (const [key, connection] of this.activeConnections.entries()) {
      if (now - connection.startTime > CONNECTION_TIMEOUT) {
        keysToDelete.push(key);
      }
    }
    
    // Remove old connections with security logging
    if (keysToDelete.length > 0) {
      console.log(`Cleaning up ${keysToDelete.length} stale connections`);
      for (const key of keysToDelete) {
        this.activeConnections.delete(key);
      }
    }
    
    // Update total active connections counter
    this.totalActiveConnections = this.activeConnections.size;
    
    // Security: Check for unusual connection patterns
    if (this.totalActiveConnections > this.maxConcurrentTotal * 0.9) {
      console.warn(`High connection count: ${this.totalActiveConnections}/${this.maxConcurrentTotal}`);
    }
  }

  /**
   * Track active connection
   */
  trackConnection(key, connection) {
    this.activeConnections.set(key, {
      ...connection,
      startTime: Date.now()
    });
    this.totalActiveConnections = this.activeConnections.size;
  }

  /**
   * Remove tracked connection
   */
  untrackConnection(key) {
    this.activeConnections.delete(key);
    this.totalActiveConnections = this.activeConnections.size;
  }

  /**
   * Start cleanup intervals
   */
  startCleanupIntervals() {
    // Rate limit cleanup
    this.rateLimitCleanupInterval = setInterval(() => {
      this.cleanupRateLimitEntries();
    }, this.connCleanupInterval);
    
    // Connection cleanup
    setInterval(() => {
      this.cleanupOldConnections();
    }, 60 * 1000); // Every minute
    
    // IP tracking cleanup
    setInterval(() => {
      this.cleanupIPTracking();
    }, this.ipCleanupInterval);
  }

  /**
   * Stop cleanup intervals and clear resources
   */
  stop() {
    if (this.rateLimitCleanupInterval) {
      clearInterval(this.rateLimitCleanupInterval);
    }
    this.rateLimit.clear();
    this.activeConnections.clear();
    this.blockedIPs.clear();
    this.ipViolationCounts.clear();
    this.messageTimestamps.clear();
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      rateLimitEntries: this.rateLimit.size,
      activeConnections: this.totalActiveConnections,
      blockedIPs: this.blockedIPs.size,
      ipViolations: this.ipViolationCounts.size
    };
  }
}

/**
 * Apply rate limiting middleware with enhanced security
 */
export const applyRateLimit = (limiter, request, response) => {
  try {
    const clientIP = getClientIP(request);
    
    // Enhanced IP validation
    if (!isValidIP(clientIP)) {
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      };
      
      response.writeHead(400, headers);
      response.end(JSON.stringify({
        error: 'Bad Request',
        message: 'Invalid IP address format'
      }));
      
      return false;
    }
    
    const result = limiter.isAllowed(clientIP, request);
    
    if (!result.allowed) {
      const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self'",
        'X-XSS-Protection': '1; mode=block'
      };
      
      if (result.retryAfter) {
        headers['Retry-After'] = result.retryAfter.toString();
      }
      
      response.writeHead(429, headers);
      response.end(JSON.stringify({
        error: 'Too Many Requests',
        message: result.reason,
        retryAfter: result.retryAfter
      }));
      
      // Record violation for potential blocking
      limiter.recordIPViolation(clientIP);
      
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Rate limit middleware error:', err);
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Internal server error - rate limiting failed' }));
    return false;
  }
};

/**
 * Get client IP from request
 */
function getClientIP(request) {
  // Get IP from various headers with security checks
  const ip = request.headers['x-forwarded-for'] || 
             request.headers['x-real-ip'] || 
             request.socket.remoteAddress;
  
  if (typeof ip !== 'string') return 'unknown';
  
  // Extract first IP from x-forwarded-for if present
  if (ip.includes(',')) {
    const ips = ip.split(',').map(i => i.trim());
    // Return the first IP that appears valid
    for (const candidate of ips) {
      if (isValidIP(candidate)) return candidate;
    }
    return ips[0]; // fallback to first
  }
  
  return ip;
}

/**
 * Validate IP address format
 */
function isValidIP(ip) {
  if (typeof ip !== 'string' || ip.length > 45) return false;
  
  // IPv4 validation
  if (ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
    const parts = ip.split('.');
    return parts.every(part => parseInt(part) >= 0 && parseInt(part) <= 255);
  }
  
  // IPv6 validation (simplified)
  if (ip.match(/^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/)) {
    return true;
  }
  
  return false;
}

/**
 * Create rate limiter instance
 */
export const createRateLimiter = (options = {}) => {
  return new RateLimiter(options);
};