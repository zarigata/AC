/**
 * Error Middleware - Global error handling with standardized responses
 */

import { sanitizeError } from '../utils/security.js';

/**
 * Standardized error types and their corresponding HTTP status codes
 */
export const ERROR_TYPES = {
  VALIDATION_ERROR: { status: 400, message: 'Validation Error' },
  AUTHENTICATION_ERROR: { status: 401, message: 'Authentication Error' },
  AUTHORIZATION_ERROR: { status: 403, message: 'Authorization Error' },
  NOT_FOUND: { status: 404, message: 'Resource Not Found' },
  RATE_LIMIT_ERROR: { status: 429, message: 'Rate Limit Exceeded' },
  SERVER_ERROR: { status: 500, message: 'Internal Server Error' },
  DATABASE_ERROR: { status: 503, message: 'Service Unavailable' },
  TIMEOUT_ERROR: { status: 408, message: 'Request Timeout' },
  NETWORK_ERROR: { status: 502, message: 'Bad Gateway' },
  EXTERNAL_SERVICE_ERROR: { status: 504, message: 'Gateway Timeout' }
};

/**
 * Create standardized error response object
 */
export const createErrorResponse = (error, request) => {
  const errorInfo = {
    timestamp: Date.now(),
    requestId: global.crypto?.randomUUID?.() || require('node:crypto').randomUUID(),
    path: request.url,
    method: request.method,
    userAgent: request.headers['user-agent'],
    ip: request.socket?.remoteAddress || 'unknown'
  };

  // Determine error type and status
  let errorType = ERROR_TYPES.SERVER_ERROR;
  let errorMessage = error.message || 'An unexpected error occurred';
  let errorDetails = null;

  // Classify error based on message or type
  if (error.name === 'ValidationError' || error.message?.toLowerCase().includes('validation')) {
    errorType = ERROR_TYPES.VALIDATION_ERROR;
  } else if (error.name === 'UnauthorizedError' || error.message?.toLowerCase().includes('unauthorized')) {
    errorType = ERROR_TYPES.AUTHENTICATION_ERROR;
  } else if (error.name === 'ForbiddenError' || error.message?.toLowerCase().includes('forbidden')) {
    errorType = ERROR_TYPES.AUTHORIZATION_ERROR;
  } else if (error.code === 'ENOENT' || error.message?.toLowerCase().includes('not found')) {
    errorType = ERROR_TYPES.NOT_FOUND;
  } else if (error.code === 'EADDRINUSE' || error.message?.toLowerCase().includes('address already in use')) {
    errorType = ERROR_TYPES.SERVER_ERROR;
    errorMessage = 'Server configuration error';
  } else if (error.code === 'ECONNREFUSED' || error.message?.toLowerCase().includes('connection refused')) {
    errorType = ERROR_TYPES.EXTERNAL_SERVICE_ERROR;
    errorMessage = 'External service unavailable';
  } else if (error.code === 'ETIMEDOUT' || error.message?.toLowerCase().includes('timeout')) {
    errorType = ERROR_TYPES.TIMEOUT_ERROR;
  }

  // Add error-specific details (excluding sensitive information)
  if (error.code) {
    errorDetails = { code: error.code };
  }
  
  if (error.field) {
    errorDetails = { ...errorDetails, field: error.field };
  }

  return {
    ...errorInfo,
    error: errorType.message,
    message: errorMessage,
    details: errorDetails,
    stack: process.env.NODE_ENV === 'development' ? sanitizeError(error.stack) : undefined
  };
};

/**
 * Global error handler middleware
 */
export const globalErrorHandler = (err, req, res, next) => {
  console.error('Global Error Handler caught error:', err);
  
  // Log full error details for debugging (in production, this might go to a logging service)
  const errorLog = {
    error: err.name || 'Unknown Error',
    message: err.message || 'No error message',
    stack: err.stack,
    timestamp: new Date().toISOString(),
    request: {
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        'authorization': req.headers.authorization ? '[REDACTED]' : undefined
      }
    }
  };

  // In production, don't expose stack traces or sensitive error details
  if (process.env.NODE_ENV === 'production') {
    console.error('Production error:', {
      error: err.name,
      message: err.message,
      path: req.url,
      method: req.method
    });
  } else {
    console.error('Development error details:', errorLog);
  }

  // Create standardized error response
  const errorResponse = createErrorResponse(err, req);

  // Set appropriate status code
  const statusCode = errorResponse.status || ERROR_TYPES.SERVER_ERROR.status;
  
  // Set headers
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Error-ID': errorResponse.requestId
  };

  // Add CORS headers if applicable
  const origin = req.headers.origin;
  if (origin && origin !== 'null' && origin !== undefined) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  // Send error response
  res.writeHead(statusCode, headers);
  
  try {
    const responsePayload = JSON.stringify(errorResponse, null, 2);
    res.end(responsePayload);
  } catch (jsonError) {
    // If JSON serialization fails, send a simple error response
    console.error('Failed to serialize error response:', jsonError);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: 'Error response serialization failed',
      requestId: errorResponse.requestId,
      timestamp: Date.now()
    }));
  }
};

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (req, res) => {
  const errorResponse = createErrorResponse(
    new Error('Resource not found'),
    req
  );
  
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  };

  const origin = req.headers.origin;
  if (origin && origin !== 'null' && origin !== undefined) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  res.writeHead(404, headers);
  res.end(JSON.stringify(errorResponse));
};

/**
 * Enhanced request logging with error tracking
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request details
  console.log(`${req.method} ${req.url} - Started`);
  
  // Track response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    
    console.log(`${req.method} ${req.url} - ${status} - ${duration}ms`);
    
    // Log errors (5xx status codes)
    if (status >= 500) {
      console.error(`Request failed: ${req.method} ${req.url} - ${status}`);
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

/**
 * Database error handler
 */
export const databaseErrorHandler = (err) => {
  console.error('Database error:', err);
  
  if (err.code === 'SQLITE_CONSTRAINT') {
    return {
      ...ERROR_TYPES.VALIDATION_ERROR,
      message: 'Database constraint violation',
      details: { code: err.code }
    };
  }
  
  if (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED') {
    return {
      ...ERROR_TYPES.DATABASE_ERROR,
      message: 'Database temporarily unavailable',
      details: { code: err.code }
    };
  }
  
  return {
    ...ERROR_TYPES.DATABASE_ERROR,
    message: 'Database operation failed',
    details: { code: err.code || 'UNKNOWN_DB_ERROR' }
  };
};

/**
 * Provider error handler
 */
export const providerErrorHandler = (err, providerName) => {
  console.error(`Provider error [${providerName}]:`, err);
  
  return {
    status: 502,
    error: 'Provider Error',
    message: `${providerName} service unavailable`,
    details: {
      provider: providerName,
      code: err.code || 'PROvider_ERROR',
      message: err.message || 'Provider service error'
    }
  };
};

/**
 * Rate limiting error handler
 */
export const rateLimitHandler = (req, res, next, options) => {
  const errorResponse = createErrorResponse(
    new Error('Rate limit exceeded'),
    req
  );
  
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-RateLimit-Limit': options.limit?.toString() || '60',
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': Math.floor(Date.now() / 1000 + 60).toString(),
    'Retry-After': '60'
  };

  const origin = req.headers.origin;
  if (origin && origin !== 'null' && origin !== undefined) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  res.writeHead(429, headers);
  res.end(JSON.stringify(errorResponse));
};

export default {
  ERROR_TYPES,
  globalErrorHandler,
  asyncHandler,
  notFoundHandler,
  requestLogger,
  databaseErrorHandler,
  providerErrorHandler,
  rateLimitHandler,
  createErrorResponse
};