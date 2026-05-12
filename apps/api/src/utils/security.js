/**
 * Security Utilities - Helper functions for sanitizing and validating data
 */

/**
 * Sanitize error messages to remove sensitive information
 */
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

/**
 * Sanitize output data to prevent injection attacks
 */
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

/**
 * Validate IP address format
 */
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

/**
 * Get trusted IP from request with security checks
 */
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

/**
 * Validate origin format and prevent wildcard origins
 */
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

/**
 * Check if origin is allowed
 */
export const isOriginAllowed = (origin, allowedOrigins) => {
  // Allow requests without origin for local development/testing
  if (!origin || origin === 'null' || origin === undefined) {
    return true;
  }
  
  // First validate the origin format
  if (!validateOrigin(origin)) {
    return false;
  }
  
  // Then check against allowed origins
  return allowedOrigins.includes(origin);
};

/**
 * Validate request size to prevent DoS attacks
 */
export const validateRequestSize = (request, maxSize = 1024 * 1024) => {
  if (request.headers['content-length']) {
    const contentLength = parseInt(request.headers['content-length']);
    if (contentLength > maxSize) {
      throw new Error(`Request size exceeds maximum limit of ${maxSize / 1024 / 1024}MB`);
    }
  }
  return true;
};

/**
 * Validate agent ID with comprehensive security checks
 */
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

/**
 * Sanitize JSON payload to prevent injection
 */
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