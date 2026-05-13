/**
 * Authentication Middleware for Zsiistant API
 * Supports both JWT and API key authentication
 * Protects all /api/ routes except /health
 */

import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

/**
 * Authentication configuration
 * Can be customized via environment variables or settings
 */
const DEFAULT_CONFIG = {
  // JWT settings - CRITICAL: Must use proper secret in production
  jwtSecret: process.env.ZSIISTANT_JWT_SECRET || 
    (process.env.NODE_ENV === 'production' ? 
      (() => {
        throw new Error('JWT_SECRET is required in production environment');
      })() : 
      'development-secret-key-change-in-production'),
  jwtExpiresIn: process.env.ZSIISTANT_JWT_EXPIRES_IN || '24h',
  
  // API Key settings
  apiKeyHeader: 'X-API-Key',
  authorizationHeader: 'Authorization',
  
  // Protected routes (all /api/ routes except /health)
  protectedRoutes: [
    '/api/agents',
    '/api/agents/', 
    '/api/chat',
    '/api/chat/',
    '/api/settings',
    '/api/settings/',
    '/api/providers',
    '/api/providers/',
    '/api/tokens',
    '/api/tokens/',
    '/api/jobs',
    '/api/jobs/',
    '/api/memory',
    '/api/memory/',
    '/api/webhooks',
    '/api/webhooks/',
    '/api/presets',
    '/api/presets/'
  ],
  
  // Public routes (no authentication required)
  publicRoutes: [
    '/health',
    '/health/',
    '/healthz',
    '/healthz/',
    '/api/agents',
    '/api/agents/',
    '/api/agents/.+',
    '/api/agents/.+/tools',
    '/api/agents/.+/tools/.+'
  ],

  // Skip authentication for these paths
  skipPaths: [
    '/health',
    '/health/',
    '/healthz', 
    '/healthz/',
    '/docs',
    '/docs/',
    '/static',
    '/static/'
  ]
};

/**
 * In-memory store for API keys (in production, this should be a database)
 * Structure: { apiKey: { name: string, created: Date, active: boolean } }
 */
const apiKeyStore = new Map();

/**
 * Default API key for testing (only in development)
 */
const defaultApiKey = process.env.NODE_ENV === 'development' ? 'zsiistant-test-api-key-12345' : null;
if (defaultApiKey) {
  apiKeyStore.set(defaultApiKey, {
    name: 'Development Test API Key',
    created: new Date(),
    active: true,
    note: 'This key is only available in development mode'
  });
  console.log('⚠️  Development API key loaded - not for production use');
}

/**
 * Generate a JWT token
 * @param {Object} payload - Token payload
 * @param {string} secret - JWT secret
 * @param {string} expiresIn - Token expiration time
 * @returns {string} JWT token
 */
function generateJWT(payload, secret, expiresIn) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid JWT payload');
  }
  
  if (!secret || typeof secret !== 'string' || secret.length < 32) {
    throw new Error('JWT secret must be at least 32 characters');
  }
  
  // Add standard JWT claims
  const jwtPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (expiresIn ? parseTimeToSeconds(expiresIn) : 86400),
    iss: 'zsiistant',
    sub: payload.userId || payload.sub || 'anonymous'
  };
  
  try {
    return jwt.sign(jwtPayload, secret, { algorithm: 'HS256' });
  } catch (err) {
    console.error('JWT generation error:', err);
    throw new Error('Failed to generate JWT token');
  }
}

/**
 * Verify a JWT token
 * @param {string} token - JWT token
 * @param {string} secret - JWT secret
 * @returns {Object} Decoded token payload
 */
function verifyJWT(token, secret) {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid JWT token');
  }
  
  if (!secret || typeof secret !== 'string' || secret.length < 32) {
    throw new Error('Invalid JWT secret');
  }
  
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return decoded;
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      throw new Error('Invalid JWT token');
    } else if (err.name === 'TokenExpiredError') {
      throw new Error('JWT token has expired');
    } else if (err.name === 'NotBeforeError') {
      throw new Error('JWT token not active yet');
    } else {
      throw new Error('JWT verification failed');
    }
  }
}

/**
 * Parse time string to seconds
 * @param {string} timeStr - Time string (e.g., '24h', '1d', '30m')
 * @returns {number} Seconds
 */
function parseTimeToSeconds(timeStr) {
  if (typeof timeStr !== 'string') {
    return 86400; // Default 24 hours
  }
  
  const match = timeStr.match(/^\s*(\d+)\s*(s|m|h|d)?\s*$/i);
  if (!match) {
    return 86400; // Default 24 hours
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2] ? match[2].toLowerCase() : 'h';
  
  const multipliers = {
    's': 1,
    'm': 60,
    'h': 3600,
    'd': 86400
  };
  
  return value * (multipliers[unit] || 3600); // Default to hours
}

/**
 * Extract token from authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null if not found
 */
function extractTokenFromHeader(authHeader) {
  if (!authHeader) return null;
  
  // Handle "Bearer <token>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  
  // Handle raw token
  return authHeader.trim();
}

/**
 * Check if a path is protected (requires authentication)
 * @param {string} path - Request path
 * @returns {boolean} True if path is protected
 */
function isProtectedPath(path) {
  // Skip authentication for explicitly excluded paths
  if (DEFAULT_CONFIG.skipPaths.some(skipPath => path.startsWith(skipPath))) {
    return false;
  }
  
  // Check if path is in public routes
  if (DEFAULT_CONFIG.publicRoutes.some(publicPath => path.startsWith(publicPath))) {
    return false;
  }
  
  // Check if path is in protected routes
  return DEFAULT_CONFIG.protectedRoutes.some(protectedPath => path.startsWith(protectedPath));
}

/**
 * Validate API key
 * @param {string} apiKey - API key to validate
 * @returns {Object|null} API key info or null if invalid
 */
function validateApiKey(apiKey) {
  if (!apiKey) return null;
  
  const keyInfo = apiKeyStore.get(apiKey);
  if (!keyInfo || !keyInfo.active) {
    return null;
  }
  
  return keyInfo;
}

/**
 * Create standardized authentication error response
 * @param {string} message - Error message
 * @param {string} type - Error type (unauthorized, invalid_token, etc.)
 * @returns {Object} Error response object
 */
function createAuthError(message, type = 'unauthorized') {
  return {
    error: {
      message,
      code: `AUTH_${type.toUpperCase()}`,
      type,
      timestamp: Date.now()
    },
    success: false
  };
}

/**
 * Authentication middleware factory
 * @param {Object} config - Authentication configuration
 * @returns {Function} Express-style middleware function
 */
function createAuthMiddleware(config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async (req, res, next) => {
    try {
      const path = req.url || '';
      
      // Skip authentication for public/unprotected paths
      if (!isProtectedPath(path)) {
        return next();
      }

      // Check for API key in headers (case insensitive)
      let apiKey = null;
      
      // Try case-insensitive lookup for API key
      const keyHeaderLower = finalConfig.apiKeyHeader.toLowerCase();
      for (const key in req.headers) {
        if (key.toLowerCase() === keyHeaderLower) {
          apiKey = req.headers[key];
          break;
        }
      }
      
      let token = null;
      
      // Check for JWT token in Authorization header
      const authHeader = req.headers[finalConfig.authorizationHeader];
      if (authHeader) {
        token = extractTokenFromHeader(authHeader);
      }

      // Validate API key if present
      let authenticated = false;
      let authInfo = {};

      // API key authentication
      if (apiKey) {
        const keyInfo = validateApiKey(apiKey);
        if (keyInfo) {
          authenticated = true;
          authInfo = {
            type: 'api_key',
            keyId: apiKey.substring(0, 8) + '...', // Truncate for security in logs
            keyName: keyInfo.name
          };
        }
      }
      
      // JWT authentication
      if (token && !authenticated) {
        try {
          const decoded = verifyJWT(token, finalConfig.jwtSecret);
          authenticated = true;
          authInfo = {
            type: 'jwt',
            userId: decoded.sub,
            payload: {
              iat: decoded.iat,
              exp: decoded.exp,
              iss: decoded.iss
            }
          };
        } catch (jwtError) {
          console.warn('JWT verification failed:', jwtError.message);
        }
      }

      // If not authenticated, return 401
      if (!authenticated) {
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'X-Auth-Error': 'unauthorized'
        });
        res.end(JSON.stringify(createAuthError(
          'Authentication required. Provide either a valid API key or JWT token.',
          'unauthorized'
        )));
        return;
      }

      // Add authentication info to request for downstream use
      req.auth = authInfo;
      
      // Add authentication headers for response
      res.setHeader('X-Authenticated', 'true');
      res.setHeader('X-Auth-Type', authInfo.type);
      
      if (authInfo.type === 'api_key') {
        res.setHeader('X-API-Key-Name', authInfo.keyName);
      } else if (authInfo.type === 'jwt') {
        res.setHeader('X-User-ID', authInfo.userId);
      }

      // Continue to next middleware
      next();

    } catch (error) {
      console.error('Authentication middleware error:', error);
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'X-Auth-Error': 'service_unavailable'
      });
      res.end(JSON.stringify(createAuthError(
        'Authentication service temporarily unavailable',
        'service_unavailable'
      )));
      return;
    }
  };
}

/**
 * Create API key
 * @param {string} name - API key name
 * @param {Object} options - Additional options
 * @returns {string} Generated API key
 */
function createApiKey(name, options = {}) {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2);
  const apiKey = `zsiistant_${name.replace(/\s+/g, '_')}_${timestamp}_${random}`;
  
  apiKeyStore.set(apiKey, {
    name,
    created: new Date(),
    active: true,
    ...options
  });
  
  return apiKey;
}

/**
 * Revoke API key
 * @param {string} apiKey - API key to revoke
 * @returns {boolean} True if revoked successfully
 */
function revokeApiKey(apiKey) {
  const keyInfo = apiKeyStore.get(apiKey);
  if (keyInfo) {
    keyInfo.active = false;
    return true;
  }
  return false;
}

/**
 * Get all active API keys
 * @returns {Array} Array of active API keys info
 */
function getApiKeys() {
  return Array.from(apiKeyStore.entries())
    .filter(([_, info]) => info.active)
    .map(([key, info]) => ({
      key: key.substring(0, 8) + '...', // Truncate for security
      name: info.name,
      created: info.created
    }));
}

/**
 * Authentication helper functions for routes
 */
export const authHelpers = {
  generateJWT,
  verifyJWT,
  createApiKey,
  revokeApiKey,
  getApiKeys,
  validateApiKey
};

// Export default for common usage
export default createAuthMiddleware;