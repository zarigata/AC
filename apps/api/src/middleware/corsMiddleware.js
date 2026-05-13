/**
 * CORS Middleware for Zsiistant API
 * Provides configurable CORS headers based on environment settings
 */

/**
 * Default CORS configuration
 * Can be overridden via environment variables
 */
const DEFAULT_CONFIG = {
  // Allowed origins - can be single origin, comma-separated list, or '*'
  allowedOrigins: process.env.ZSIISTANT_CORS_ORIGINS || 
    'http://localhost:3000,http://localhost:4000,http://127.0.0.1:3000,http://127.0.0.1:4000,http://localhost:5000,http://127.0.0.1:5000',
  
  // Whether to allow credentials
  allowCredentials: process.env.ZSIISTANT_CORS_CREDENTIALS === 'true' || true,
  
  // Allowed HTTP methods
  allowedMethods: process.env.ZSIISTANT_CORS_METHODS || 'GET, POST, PATCH, DELETE, OPTIONS, HEAD',
  
  // Allowed headers
  allowedHeaders: process.env.ZSIISTANT_CORS_HEADERS || 
    'Content-Type, Authorization, X-Requested-With, X-API-Key, X-Content-Type-Options',
  
  // Exposed headers for client access
  exposedHeaders: process.env.ZSIISTANT_CORS_EXPOSED_HEADERS || '',
  
  // Maximum age for preflight requests (in seconds)
  maxAge: parseInt(process.env.ZSIISTANT_CORS_MAX_AGE) || 86400, // 24 hours
  
  // Whether to allow all origins (development only)
  allowAllOrigins: process.env.ZSIISTANT_CORS_ALLOW_ALL === 'true' || false
};

/**
 * Parse origins from string to array
 * @param {string} origins - Comma-separated origins string
 * @returns {Array} Array of origins
 */
function parseOrigins(origins) {
  if (!origins || origins === '*') return ['*'];
  return origins.split(',').map(origin => origin.trim()).filter(origin => origin);
}

/**
 * Check if origin is allowed
 * @param {string} origin - Origin to check
 * @param {Array} allowedOrigins - Array of allowed origins
 * @returns {boolean} True if origin is allowed
 */
function isOriginAllowed(origin, allowedOrigins) {
  if (!origin || origin === 'null' || !String(origin).trim()) return true;
  
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

/**
 * Get CORS headers for a request
 * @param {Object} req - Request object
 * @param {Object} config - CORS configuration
 * @returns {Object} CORS headers object
 */
function getCorsHeaders(req, config = DEFAULT_CONFIG) {
  const headers = {};
  const origin = req.headers.origin;
  const allowedOrigins = parseOrigins(config.allowedOrigins);
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    headers['Access-Control-Allow-Methods'] = config.allowedMethods;
    headers['Access-Control-Allow-Headers'] = config.allowedHeaders;
    headers['Access-Control-Max-Age'] = config.maxAge.toString();
    
    if (origin && isOriginAllowed(origin, allowedOrigins)) {
      headers['Access-Control-Allow-Origin'] = origin;
      if (config.allowCredentials) {
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
    } else if (config.allowAllOrigins) {
      headers['Access-Control-Allow-Origin'] = '*';
    }
    
    return headers;
  }
  
  // Handle regular requests
  if (origin && isOriginAllowed(origin, allowedOrigins)) {
    headers['Access-Control-Allow-Origin'] = origin;
    
    if (config.allowCredentials) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    
    if (config.exposedHeaders) {
      headers['Access-Control-Expose-Headers'] = config.exposedHeaders;
    }
  } else if (config.allowAllOrigins) {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  
  return headers;
}

/**
 * CORS middleware factory
 * @param {Object} config - CORS configuration
 * @returns {Function} Express-style middleware function
 */
function createCorsMiddleware(config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  return (req, res, next) => {
    try {
      // Add CORS headers
      const corsHeaders = getCorsHeaders(req, finalConfig);
      
      // Set CORS headers if any are needed
      if (Object.keys(corsHeaders).length > 0) {
        for (const [key, value] of Object.entries(corsHeaders)) {
          res.setHeader(key, value);
        }
      }
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      
      // Continue to next middleware
      next();
      
    } catch (error) {
      console.error('CORS middleware error:', error);
      // Continue to next middleware even if there's an error
      next();
    }
  };
}

/**
 * Validate CORS configuration
 * @param {Object} config - CORS configuration to validate
 * @returns {Array} Array of validation errors
 */
function validateCorsConfig(config) {
  const errors = [];
  
  if (config.allowedOrigins && typeof config.allowedOrigins !== 'string') {
    errors.push('allowedOrigins must be a string');
  }
  
  if (config.allowedMethods && typeof config.allowedMethods !== 'string') {
    errors.push('allowedMethods must be a string');
  }
  
  if (config.allowedHeaders && typeof config.allowedHeaders !== 'string') {
    errors.push('allowedHeaders must be a string');
  }
  
  if (config.exposedHeaders && typeof config.exposedHeaders !== 'string') {
    errors.push('exposedHeaders must be a string');
  }
  
  if (config.maxAge && (typeof config.maxAge !== 'number' || config.maxAge < 0)) {
    errors.push('maxAge must be a positive number');
  }
  
  return errors;
}

/**
 * Get current CORS configuration
 * @returns {Object} Current CORS configuration
 */
function getCorsConfig() {
  return { ...DEFAULT_CONFIG };
}

/**
 * Update CORS configuration at runtime
 * @param {Object} newConfig - New configuration
 * @returns {boolean} True if configuration was updated
 */
function updateCorsConfig(newConfig) {
  const errors = validateCorsConfig(newConfig);
  if (errors.length > 0) {
    console.error('CORS configuration errors:', errors);
    return false;
  }
  
  Object.assign(DEFAULT_CONFIG, newConfig);
  return true;
}

export default createCorsMiddleware;
export { createCorsMiddleware, getCorsConfig, updateCorsConfig, validateCorsConfig };