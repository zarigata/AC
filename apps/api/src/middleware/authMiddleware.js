/**
 * Authentication Middleware for Zsiistant API
 * Supports both JWT and API key authentication
 * Protects all /api/ routes except /health
 */

import { createHash } from 'node:crypto';
// TODO: Add jsonwebtoken import when package is available
// import jwt from 'jsonwebtoken';

/**
 * Authentication configuration
 * Can be customized via environment variables or settings
 */
const DEFAULT_CONFIG = {
  // JWT settings
  jwtSecret: process.env.ZSIISTANT_JWT_SECRET || 'your-secret-key-change-in-production',
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
    '/api/providers/'
  ],
  
  // Public routes (no authentication required)
  publicRoutes: [
    '/health',
    '/health/',
    '/healthz',
    '/healthz/'
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
 * Default API key for testing
 */
const defaultApiKey = 'zsiistant-test-api-key-12345';
apiKeyStore.set(defaultApiKey, {
  name: 'Test API Key',
  created: new Date(),
  active: true
});

/**
 * Generate a JWT token (placeholder - requires jsonwebtoken package)
 * @param {Object} payload - Token payload
 * @param {string} secret - JWT secret
 * @param {string} expiresIn - Token expiration time
 * @returns {string} JWT token
 */
function generateJWT(payload, secret, expiresIn) {
  // TODO: Implement when jsonwebtoken is available
  throw new Error('JWT support not available - install jsonwebtoken package');
}

/**
 * Verify a JWT token (placeholder - requires jsonwebtoken package)
 * @param {string} token - JWT token
 * @param {string} secret - JWT secret
 * @returns {Object} Decoded token payload
 */
function verifyJWT(token, secret) {
  // TODO: Implement when jsonwebtoken is available
  throw new Error('JWT support not available - install jsonwebtoken package');
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

      // Only API key authentication is supported for now
      // TODO: Add JWT support when jsonwebtoken is available
      if (apiKey) {
        const keyInfo = validateApiKey(apiKey);
        if (keyInfo) {
          authenticated = true;
          authInfo = {
            type: 'api_key',
            keyId: apiKey, // In production, use a hashed or truncated version
            keyName: keyInfo.name
          };
        }
      }

      // JWT authentication is not available yet
      if (token) {
        // JWT support not available - install jsonwebtoken package
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