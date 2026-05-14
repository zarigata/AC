/**
 * Authentication Routes - Login, Registration, Token Management
 */

import { UserManager } from "../database/userManager.js";
import createAuthMiddleware from "../middleware/authMiddleware.js";

const userManager = new UserManager(process.env.ZSIISTANT_DB_PATH ?? new URL("../data/zsiistant.sqlite", import.meta.url).pathname);

/**
 * Authentication routes configuration
 */
export function registerAuthRoutes(server) {
  // POST /api/auth/register - Register new user
  server.on('request', async (req, res) => {
    if (req.url === '/api/auth/register' && req.method === 'POST') {
      try {
        const body = await getRequestBody(req);
        const { username, email, password } = JSON.parse(body);

        // Validate input
        if (!username || !email || !password) {
          sendError(res, 400, 'Username, email, and password are required');
          return;
        }

        if (password.length < 8) {
          sendError(res, 400, 'Password must be at least 8 characters long');
          return;
        }

        // Create user
        const user = await userManager.createUser({
          username,
          email,
          password
        });

        // Generate tokens
        const accessToken = await userManager.createAccessToken(user);
        const refreshToken = await userManager.createRefreshToken(user.id);

        // Success response
        sendResponse(res, 201, {
          success: true,
          message: 'User registered successfully',
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            created_at: user.created_at
          },
          tokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: process.env.ZSIISTANT_JWT_EXPIRES_IN || '1h'
          }
        });
      } catch (error) {
        console.error('Registration error:', error);
        sendError(res, 400, error.message || 'Registration failed');
      }
    }
  });

  // POST /api/auth/login - User login
  server.on('request', async (req, res) => {
    if (req.url === '/api/auth/login' && req.method === 'POST') {
      try {
        const body = await getRequestBody(req);
        const { username, password } = JSON.parse(body);

        // Validate input
        if (!username || !password) {
          sendError(res, 400, 'Username and password are required');
          return;
        }

        // Authenticate user
        const user = await userManager.authenticateUser(username, password);

        // Generate tokens
        const accessToken = await userManager.createAccessToken(user);
        const refreshToken = await userManager.createRefreshToken(user.id);

        // Success response
        sendResponse(res, 200, {
          success: true,
          message: 'Login successful',
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            last_login: user.last_login
          },
          tokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: process.env.ZSIISTANT_JWT_EXPIRES_IN || '1h'
          }
        });
      } catch (error) {
        console.error('Login error:', error);
        sendError(res, 401, error.message || 'Authentication failed');
      }
    }
  });

  // POST /api/auth/refresh - Refresh access token
  server.on('request', async (req, res) => {
    if (req.url === '/api/auth/refresh' && req.method === 'POST') {
      try {
        const body = await getRequestBody(req);
        const { refresh_token } = JSON.parse(body);

        if (!refresh_token) {
          sendError(res, 400, 'Refresh token is required');
          return;
        }

        // Refresh access token
        const newAccessToken = await userManager.refreshAccessToken(refresh_token);

        sendResponse(res, 200, {
          success: true,
          message: 'Token refreshed successfully',
          access_token: newAccessToken,
          expires_in: process.env.ZSIISTANT_JWT_EXPIRES_IN || '1h'
        });
      } catch (error) {
        console.error('Token refresh error:', error);
        sendError(res, 401, error.message || 'Token refresh failed');
      }
    }
  });

  // POST /api/auth/logout - User logout
  server.on('request', async (req, res) => {
    if (req.url === '/api/auth/logout' && req.method === 'POST') {
      try {
        const body = await getRequestBody(req);
        const { refresh_token } = JSON.parse(body) || {};

        if (refresh_token) {
          await userManager.revokeRefreshToken(refresh_token);
        }

        sendResponse(res, 200, {
          success: true,
          message: 'Logout successful'
        });
      } catch (error) {
        console.error('Logout error:', error);
        // Still return success even if token revocation fails
        sendResponse(res, 200, {
          success: true,
          message: 'Logout successful'
        });
      }
    }
  });

  // GET /api/auth/me - Get current user info (requires auth)
  server.on('request', async (req, res) => {
    if (req.url === '/api/auth/me' && req.method === 'GET') {
      try {
        // Apply authentication middleware
        const authResult = await createAuthMiddleware()(req, res);
        if (authResult === 'next') {
          const userId = req.auth.userId;
          const user = await userManager.getUserById(userId);
          
          if (user) {
            sendResponse(res, 200, {
              success: true,
              user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                created_at: user.created_at,
                last_login: user.last_login
              }
            });
          } else {
            sendError(res, 404, 'User not found');
          }
        }
      } catch (error) {
        console.error('Get user error:', error);
        sendError(res, 500, 'Failed to get user information');
      }
    }
  });

  // GET /api/auth/users - Get all users (admin only)
  server.on('request', async (req, res) => {
    if (req.url === '/api/auth/users' && req.method === 'GET') {
      try {
        // Apply authentication middleware
        const authResult = await createAuthMiddleware()(req, res);
        if (authResult === 'next') {
          const user = req.auth;
          
          // Check if user is admin
          if (user.role !== 'admin') {
            sendError(res, 403, 'Access denied - Admin required');
            return;
          }

          const users = await userManager.getAllUsers();
          sendResponse(res, 200, {
            success: true,
            users,
            total: users.length
          });
        }
      } catch (error) {
        console.error('Get users error:', error);
        sendError(res, 500, 'Failed to get users');
      }
    }
  });
}

// Helper functions
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendError(res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
  });
  res.end(JSON.stringify({
    success: false,
    error: message,
    timestamp: new Date().toISOString()
  }));
}