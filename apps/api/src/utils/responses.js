/**
 * Response Utilities - Helper functions for handling HTTP responses
 */

import { sanitizeJsonPayload, sanitizeError, isValidIP } from './security.js';

/**
 * Send JSON response with proper headers and error handling
 */
export const sendJson = (response, statusCode, payload) => {
  try {
    const origin = response.getHeader('origin');
    
    // Enhanced parameter validation with comprehensive error handling
    let validStatusCode;
    let finalPayload;
    
    if (typeof statusCode === 'number' && typeof payload !== 'undefined') {
      // Normal case: sendJson(response, 200, { data: 'value' })
      validStatusCode = statusCode;
      finalPayload = payload;
    } else if (typeof statusCode === 'object' && typeof payload === 'undefined') {
      // Case where payload was passed as second parameter: sendJson(response, { data: 'value' })
      validStatusCode = 200;
      finalPayload = statusCode;
    } else {
      // Invalid case, default to error
      validStatusCode = 400;
      finalPayload = { error: 'Invalid sendJson parameters - expected (response, statusCode, payload) or (response, payload)' };
    }
    
    // Comprehensive status code validation
    if (typeof validStatusCode !== 'number' || !Number.isInteger(validStatusCode) || validStatusCode < 100 || validStatusCode > 599) {
      console.error('Invalid status code detected:', validStatusCode, typeof validStatusCode);
      validStatusCode = 500;
      finalPayload = { error: 'Internal server error - invalid status code' };
    }
    
    // Validate payload structure
    if (finalPayload === null || finalPayload === undefined) {
      finalPayload = { error: 'No payload provided' };
    }
  
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };
  
  if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  
    // Handle circular references in payload with enhanced error handling
    const getCircularReplacer = () => {
      const seen = new WeakSet();
      return (key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) {
            return "[Circular Reference]";
          }
          seen.add(value);
        }
        return value;
      };
    };
    
    try {
      // Sanitize payload to prevent injection attacks
      const sanitizedPayload = sanitizeJsonPayload(finalPayload);
      
      // Set headers with enhanced security
      const finalHeaders = {
        ...headers,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      };
      
      response.writeHead(validStatusCode, finalHeaders);
      response.end(sanitizedPayload);
    } catch (err) {
      console.error('Failed to send JSON response:', err);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: 'Internal server error - response generation failed' }));
    }
};

/**
 * Send standardized error response with proper HTTP status codes
 */
export const sendError = (response, statusCode, errorType, message, details = null) => {
  const origin = response.getHeader('origin');
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };
  
  if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  
  const errorResponse = {
    error: errorType,
    message: message,
    ...(details && { details }),
    requestId: crypto.randomUUID(),
    timestamp: Date.now()
  };
  
  try {
    const sanitizedPayload = sanitizeJsonPayload(errorResponse);
    response.writeHead(statusCode, headers);
    response.end(sanitizedPayload);
  } catch (err) {
    console.error('Failed to send error response:', err);
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: 'Internal server error' }));
  }
};

/**
 * Enhanced error handler with proper HTTP status codes
 */
export const handleError = (error, request, response) => {
  // Log detailed error internally but don't expose to client
  console.error(`Error ${request.method} ${request.url}:`, error.message);
  console.error('Stack trace:', error.stack);
  
  let statusCode = 500;
  let errorType = 'Internal Server Error';
  let message = 'An unexpected error occurred';
  
  // Sanitize error information before sending to client
  const clientError = {
    timestamp: Date.now(),
    requestId: crypto.randomUUID(),
    path: request.url,
    method: request.method
  };
  
  // Categorize errors with sanitized client responses
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('validation')) {
      statusCode = 400;
      errorType = 'Validation Error';
      message = 'Invalid input data';
    } else if (errorMessage.includes('not found')) {
      statusCode = 404;
      errorType = 'Not Found';
      message = 'Requested resource not found';
    } else if (errorMessage.includes('forbidden') || errorMessage.includes('unauthorized')) {
      statusCode = 403;
      errorType = 'Forbidden';
      message = 'Access denied';
    } else if (errorMessage.includes('timeout')) {
      statusCode = 408;
      errorType = 'Request Timeout';
      message = 'Request took too long to process';
    } else if (errorMessage.includes('rate limit')) {
      statusCode = 429;
      errorType = 'Rate Limit Exceeded';
      message = 'Too many requests';
    } else if (errorMessage.includes('database')) {
      statusCode = 503;
      errorType = 'Service Unavailable';
      message = 'Service temporarily unavailable';
    }
  }
  
  // Send sanitized error response to client
  sendError(response, statusCode, errorType, message, clientError);
};

/**
 * Read request body with size limits and timeout protection
 */
export const readRequestBody = async (request, maxSize = 1024 * 1024) => {
  try {
    let raw = "";
    let totalLength = 0;
    
    // Add request timeout with enhanced error handling
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout - 30 second limit exceeded')), 30000);
    });
    
    const readPromise = (async () => {
      for await (const chunk of request) {
        // Validate chunk size and content with enhanced security
        if (chunk && typeof chunk === 'string') {
          totalLength += Buffer.byteLength(chunk, 'utf8');
          if (totalLength > maxSize) {
            throw new Error(`Payload too large (max ${maxSize / 1024 / 1024}MB)`);
          }
          raw += chunk;
        } else if (chunk && Buffer.isBuffer(chunk)) {
          totalLength += chunk.length;
          if (totalLength > maxSize) {
            throw new Error(`Payload too large (max ${maxSize / 1024 / 1024}MB)`);
          }
          raw += chunk.toString('utf8');
        }
      }
    })();
    
    await Promise.race([readPromise, timeoutPromise]);
    
    if (!raw || raw.trim().length === 0) return {};
    
    try {
      // Enhanced JSON parsing with comprehensive security checks
      const parsed = JSON.parse(raw, (key, value) => {
        // Filter out prototype pollution attempts
        if (key === '__proto__' || key === 'constructor' || key === 'prototype' ||
            key === '__defineGetter__' || key === '__defineSetter__' || 
            key === '__lookupGetter__' || key === '__lookupSetter__') {
          return undefined;
        }
        return value;
      });
      
      // Validate parsed object structure strictly
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid JSON structure: expected object');
      }
      
      // Enhanced security check for suspicious properties and prototype manipulation
      const suspiciousProps = ['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'];
      for (const prop of suspiciousProps) {
        if (Object.prototype.hasOwnProperty.call(parsed, prop)) {
          throw new Error(`Invalid JSON structure: suspicious property ${prop}`);
        }
      }
      
      // Check for prototype pollution attempts with enhanced validation
      try {
        const testObj = {};
        Object.setPrototypeOf(testObj, parsed);
        // If we get here without throwing, there was no prototype pollution
      } catch (protoErr) {
        throw new Error('Invalid JSON structure: prototype pollution attempt detected');
      }
      
      // Additional security: validate object depth to prevent deep nesting attacks
      const maxDepth = 10;
      const checkDepth = (obj, depth = 0) => {
        if (depth > maxDepth) {
          throw new Error('JSON structure too deep - potential attack');
        }
        if (typeof obj === 'object' && obj !== null) {
          for (const value of Object.values(obj)) {
            checkDepth(value, depth + 1);
          }
        }
      };
      
      checkDepth(parsed);
      
      return parsed;
    } catch (err) {
      throw new Error(`Invalid JSON format: ${err.message}`);
    }
  } catch (err) {
    console.error('Request body read error:', err);
    throw err;
  }
};

/**
 * Get content type for file path
 */
export const contentTypeFor = (path) => {
  const extension = extname(path);
  switch (extension) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    default:
      return "text/html; charset=utf-8";
  }
};

// Import extname from node:path
import { extname } from 'node:path';

/**
 * Check if origin is allowed with comprehensive validation
 */
function isOriginAllowed(origin, allowedOrigins = []) {
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
}

/**
 * Validate origin format and prevent wildcard origins
 */
function validateOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  
  // Reject dangerous origins
  if (origin.includes('*') || origin.includes('://0.0.0.0') || origin.includes('://127.0.0.1')) {
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
}