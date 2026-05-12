/**
 * Security Middleware - Contains security validation, rate limiting, and authentication functions
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { inspect } from 'node:util';

// Security helper functions
export const sanitizeError = (error) => {
  if (!error) return 'Unknown error';
  
  // Convert to string if not already
  const errorStr = typeof error === 'string' ? error : error.message || 'Unknown error';
  
  // Remove potentially sensitive information
  return errorStr
    .replace(/API key[^\s]*[^\s\w]/gi, '***')
    .replace(/token[^\s]*[^\s\w]/gi, '***')
    .replace(/password[^\s]*[^\s\w]/gi, '***')
    .replace(/secret[^\s]*[^\s\w]/gi, '***')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '***')
    .substring(0, 500); // Limit length
};

export const sanitizeOutput = (data) => {
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'string') {
    // Remove potentially dangerous characters from strings
    return data
      .replace(/<[^>]*script[^>]*>.*?<\/[^>]*script[^>]*>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/\x00/g, '')
      .substring(0, 1000); // Limit length
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeOutput(item));
  }
  
  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      // Skip potentially dangerous keys
      if (key.includes('password') || key.includes('secret') || key.includes('token')) {
        sanitized[key] = '***';
      } else {
        sanitized[key] = sanitizeOutput(value);
      }
    }
    return sanitized;
  }
  
  return data;
};

// Enhanced rate limiting with better security
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 60;
const MAX_RATE_LIMIT_ENTRIES = 5000; // Reduced for better memory security
const CONN_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// WebSocket rate limiting data structure
export const messageTimestamps = new Map();

// IP tracking and blocking for abuse prevention
const blockedIPs = new Set();
const ipViolationCounts = new Map();
const BLOCK_THRESHOLD = 50; // violations before blocking
const BLOCK_DURATION = 30 * 60 * 1000; // 30 minutes
const IP_CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes

export const isBlockedIP = (ip) => {
  return blockedIPs.has(ip);
};

export const recordIPViolation = (ip) => {
  const now = Date.now();
  const count = (ipViolationCounts.get(ip) || 0) + 1;
  ipViolationCounts.set(ip, count);
  
  // Block IP if threshold exceeded
  if (count >= BLOCK_THRESHOLD) {
    blockedIPs.add(ip);
    // Schedule unblocking
    setTimeout(() => {
      blockedIPs.delete(ip);
      ipViolationCounts.delete(ip);
    }, BLOCK_DURATION);
    console.log(`IP ${ip} blocked due to ${count} violations`);
  }
};

const cleanupIPTracking = () => {
  const now = Date.now();
  for (const [ip, lastViolation] of ipViolationCounts.entries()) {
    if (now - lastViolation > BLOCK_DURATION) {
      ipViolationCounts.delete(ip);
    }
  }
};

// Start IP tracking cleanup
setInterval(cleanupIPTracking, IP_CLEANUP_INTERVAL);

// CSRF protection
const CSRF_TOKEN_SECRET = process.env.CSRF_TOKEN_SECRET || randomBytes(32).toString('hex');
const csrfTokenStore = new Map();

export const generateCSRFToken = () => {
  const token = randomBytes(32).toString('hex');
  const hmac = createHmac('sha256', CSRF_TOKEN_SECRET).update(token).digest('hex');
  csrfTokenStore.set(token, Date.now());
  return { token, hmac };
};

export const validateCSRFToken = (token) => {
  if (!token || typeof token !== 'string') return false;
  
  const hmac = createHmac('sha256', CSRF_TOKEN_SECRET).update(token).digest('hex');
  const isValidHmac = crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(token.split('.')[1] || '')
  );
  
  const isValidToken = csrfTokenStore.has(token) && isValidHmac;
  
  if (isValidToken) {
    csrfTokenStore.delete(token);
  }
  
  return isValidToken;
};

const cleanupCSRFTokenStore = () => {
  const now = Date.now();
  const TOKEN_LIFETIME = 30 * 60 * 1000; // 30 minutes
  
  for (const [token, timestamp] of csrfTokenStore.entries()) {
    if (now - timestamp > TOKEN_LIFETIME) {
      csrfTokenStore.delete(token);
    }
  }
};

// Start CSRF token cleanup
setInterval(cleanupCSRFTokenStore, 15 * 60 * 1000); // Every 15 minutes

// Rate limiting secret
export const RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || randomBytes(32).toString('hex');

export const createRateLimitKey = (clientIP, timestamp) => {
  // Hash the IP for better privacy and security
  const ipHash = createHash('sha256').update(clientIP).digest('hex').substring(0, 16);
  const windowStart = Math.floor(timestamp / RATE_LIMIT_WINDOW) * RATE_LIMIT_WINDOW;
  return `${ipHash}:${windowStart}`;
};

export const getTrustedIP = (request) => {
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
};

export const isValidIP = (ip) => {
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
};

export const validateRequestSize = (request) => {
  if (request.headers['content-length']) {
    const contentLength = parseInt(request.headers['content-length']);
    if (contentLength > 1024 * 1024) { // 1MB limit
      throw new Error(`Request size exceeds maximum limit of 1MB`);
    }
  }
  return true;
};

// Enhanced SQL injection protection for agent ID validation
export const validateAgentId = (agentId, fieldName = 'agent ID') => {
  if (!agentId || typeof agentId !== 'string' || agentId.length > 64 || agentId.length < 1) {
    throw new Error(`Invalid ${fieldName}: must be 1-64 characters`);
  }
  
  // Check for SQL injection patterns
  const sqlPatterns = [
    /;\s*--/g,
    /'/g,
    /"/g,
    /`/g,
    /\\/g,
    /SELECT\s+/gi,
    /INSERT\s+/gi,
    /UPDATE\s+/gi,
    /DELETE\s+/gi,
    /DROP\s+/gi,
    /CREATE\s+/gi,
    /ALTER\s+/gi,
    /UNION\s+/gi,
    /EXEC\s+/gi,
    /EXECUTE\s+/gi,
    /script/gi,
    /javascript/gi,
    /iframe/gi,
    /object/gi,
    /embed/gi
  ];
  
  // Additional reserved names check
  const reservedNames = ['admin', 'system', 'root', 'database', 'sql', 'delete', 'drop', 'create', 'alter'];
  const lowerAgentId = agentId.toLowerCase();
  
  if (reservedNames.some(name => lowerAgentId.includes(name))) {
    throw new Error(`Invalid ${fieldName}: contains reserved name`);
  }
  
  for (const pattern of sqlPatterns) {
    if (pattern.test(agentId)) {
      throw new Error(`Invalid ${fieldName}: contains potentially malicious content`);
    }
  }
  
  // Check for dangerous characters
  if (/[\x00-\x1F\x7F-\x9F]/.test(agentId)) {
    throw new Error(`Invalid ${fieldName}: contains control characters`);
  }
  
  return agentId;
};

export const validateOrigin = (origin) => {
  if (!origin || typeof origin !== 'string') return false;
  
  // Reject dangerous origins
  if (origin.includes('*') || origin.includes('://0.0.0.0') || origin.includes('://0.0.0.0')) {
    return false;
  }
  
  // Only allow specific protocols
  if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
    return false;
  }
  
  // Validate URL format
  try {
    new URL(origin);
    return true;
  } catch {
    return false;
  }
};

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:4000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4000",
  "null", // Allow requests without origin header (local testing)
  undefined // Allow requests without origin header
];

export const isOriginAllowed = (origin) => {
  // Allow requests without origin for local development/testing
  if (!origin || origin === 'null' || origin === undefined) {
    return true;
  }
  
  // First validate the origin format
  if (!validateOrigin(origin)) {
    return false;
  }
  
  // Then check against allowed origins
  return ALLOWED_ORIGINS.includes(origin);
};

// Sanitize JSON payload to prevent injection
export const sanitizeJsonPayload = (payload) => {
  try {
    if (payload === undefined || payload === null) {
      return JSON.stringify({ error: 'No data provided' });
    }
    const jsonString = JSON.stringify(payload);
    // Remove potentially dangerous characters that could break JSON parsing
    return jsonString.replace(/\u0000/g, '').replace(/\r\n/g, '\n');
  } catch (err) {
    console.error('Sanitization error:', err, 'Payload:', payload);
    throw new Error('Failed to sanitize payload');
  }
};

// Clean up old entries more efficiently with enhanced memory management
export const cleanupRateLimitEntries = () => {
  const now = Date.now();
  const keysToDelete = [];
  
  // First pass: collect old entries
  for (const [key, data] of rateLimit.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      keysToDelete.push(key);
    }
  }
  
  // Delete old entries in batch
  for (const key of keysToDelete) {
    rateLimit.delete(key);
  }
  
  // If we still have too many entries, enforce hard limit with more aggressive cleanup
  if (rateLimit.size > MAX_RATE_LIMIT_ENTRIES) {
    // Sort by timestamp (most recent first)
    const sortedEntries = Array.from(rateLimit.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp);
    
    // Clear the map and repopulate with only the most recent entries
    rateLimit.clear();
    const entriesToKeep = sortedEntries.slice(0, MAX_RATE_LIMIT_ENTRIES / 4); // Keep 25% of capacity
    
    for (const [key, data] of entriesToKeep) {
      rateLimit.set(key, data);
    }
    
    console.log(`Rate limit memory optimization: removed ${rateLimit.size - entriesToKeep.length} entries to stay under limit`);
  }
};

// Apply rate limiting middleware
export const applyRateLimit = (request, response) => {
  try {
    const clientIP = getTrustedIP(request);
    const userAgent = request.headers['user-agent'] || '';
    const timestamp = Date.now();
    
    // Validate client IP format
    if (!clientIP || clientIP === 'unknown') {
      sendError(response, 400, 'Invalid Client IP', 'Invalid client IP address');
      return false;
    }
    
    // Check if IP is already blocked
    if (isBlockedIP(clientIP)) {
      sendError(response, 429, 'IP Blocked', 'Your IP address has been temporarily blocked');
      return false;
    }
    
    // Clean up old entries more efficiently
    cleanupRateLimitEntries();
    
    // Create secure rate limit key
    const rateLimitKey = createRateLimitKey(clientIP, timestamp);
    
    // Check if IP is rate limited
    if (rateLimit.has(rateLimitKey)) {
      const data = rateLimit.get(rateLimitKey);
      if (timestamp - data.timestamp < RATE_LIMIT_WINDOW && data.count >= MAX_REQUESTS_PER_MINUTE) {
        sendError(response, 429, 'Rate Limit Exceeded', `Max ${MAX_REQUESTS_PER_MINUTE} requests per minute per client allowed`, {
          retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (timestamp - data.timestamp)) / 1000),
          timestamp: timestamp
        });
        return false;
      }
      
      // Increment count with bounds checking
      data.count = Math.min(data.count + 1, MAX_REQUESTS_PER_MINUTE);
      data.timestamp = timestamp;
      data.userAgent = userAgent.substring(0, 500); // Truncate safely
    } else {
      // Create new entry with validation and bounds checking
      const safeUserAgent = userAgent.length > 500 ? userAgent.substring(0, 500) : userAgent;
      rateLimit.set(rateLimitKey, { count: 1, timestamp: timestamp, userAgent: safeUserAgent });
    }
    
    return true;
  } catch (err) {
    console.error('Rate limit error:', err);
    // Don't expose error details to client for security
    sendError(response, 500, 'Internal Server Error', 'Rate limiting service temporarily unavailable');
    return false;
  }
};

// Optimized rate limit cleanup with better performance
export const startRateLimitCleanup = () => {
  setInterval(() => {
    const now = Date.now();
    const keysToDelete = [];
    
    // Batch collect keys to delete and perform size check in one pass
    for (const [key, data] of rateLimit.entries()) {
      if (now - data.timestamp > RATE_LIMIT_WINDOW) {
        keysToDelete.push(key);
      }
    }
    
    // Batch delete for better performance
    for (const key of keysToDelete) {
      rateLimit.delete(key);
    }
    
    // Memory optimization: enforce maximum size with efficient cleanup
    if (rateLimit.size > MAX_REQUESTS_PER_MINUTE * 15) {
      // Sort by timestamp and keep most recent entries
      const sortedEntries = Array.from(rateLimit.entries())
        .sort((a, b) => b[1].timestamp - a[1].timestamp);
      
      // Clear and repopulate with recent entries
      rateLimit.clear();
      const entriesToKeep = sortedEntries.slice(0, MAX_REQUESTS_PER_MINUTE * 10);
      
      for (const [key, data] of entriesToKeep) {
        rateLimit.set(key, data);
      }
      
      console.log(`Rate limit cleanup: removed ${rateLimit.size - entriesToKeep.length} old entries`);
    }
  }, CONN_CLEANUP_INTERVAL);
};

// Clean up on exit
export const cleanupRateLimitOnExit = () => {
  if (typeof setInterval !== 'undefined') {
    clearInterval(this.rateLimitCleanupInterval);
  }
  rateLimit.clear();
};