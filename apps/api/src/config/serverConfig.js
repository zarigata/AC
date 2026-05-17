/**
 * Server Configuration - Main server setup, configuration, and initialization
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setInterval } from "node:timers";
import { WebSocketServer } from "ws";
import { randomBytes } from "node:crypto";

import { registerAgentRoutes } from "../routes/agents.js";
import { registerChatRoutes } from "../routes/chat.js";
import { registerSettingsRoutes } from "../routes/settings.js";
import { registerProviderRoutes } from "../routes/providers.js";
import { registerHealthRoutes } from "../routes/health.js";

import { applyRateLimit, cleanupRateLimitEntries, cleanupRateLimitOnExit, startRateLimitCleanup } from "../middleware/security.js";
import { readRequestBody, sendJson, sendError, handleError } from "../middleware/requestHandler.js";
import { handleWebSocketUpgrade, broadcastMessage, broadcastAgentStatus } from "../middleware/webSocketHandler.js";
import { startJobProcessor } from "../middleware/jobProcessor.js";
import { initializeProviders } from "../middleware/providerManager.js";
import { webhookManager } from "../adapters/webhookManager.js";

// Settings object that can be updated at runtime
export const settings = {
  version: "0.2.0",
  defaultModel: "qwen3",
  maxAgents: 100,
  supportedIsolationModes: ["isolated", "selective", "mesh"],
  supportedLinkModes: ["observe", "message", "delegate"],
  providers: 0, // Will be updated after initialization
  cors: {
    allowedOrigins: process.env.ZSIISTANT_CORS_ORIGINS || 
      (process.env.NODE_ENV === 'production' ? 
        (process.env.ZSIISTANT_CORS_ORIGINS ? process.env.ZSIISTANT_CORS_ORIGINS : '') : 
        'http://localhost:3000,http://localhost:4000,http://127.0.0.1:3000,http://127.0.0.1:4000,http://localhost:5000,http://127.0.0.1:5000'),
    allowedMethods: process.env.ZSIISTANT_CORS_METHODS || 'GET, POST, PATCH, DELETE, OPTIONS, HEAD',
    allowedHeaders: process.env.ZSIISTANT_CORS_HEADERS || 'Content-Type, Authorization, X-Requested-With, X-API-Key, X-Content-Type-Options',
    exposedHeaders: process.env.ZSIISTANT_CORS_EXPOSED_HEADERS || '',
    maxAge: parseInt(process.env.ZSIISTANT_CORS_MAX_AGE) || 86400,
    allowCredentials: process.env.NODE_ENV === 'production' ? 
      (process.env.ZSIISTANT_CORS_CREDENTIALS === 'true' && process.env.ZSIISTANT_CORS_ORIGINS) : true,
    allowAllOrigins: process.env.NODE_ENV === 'development' && 
      (process.env.ZSIISTANT_CORS_ALLOW_ALL === 'true' || false)
  }
};

// Global server state
export const serverState = {
  startTime: Date.now(),
  jobProcessorCleanup: null,
  rateLimitCleanupInterval: null,
  totalActiveConnections: 0,
  websocketServer: null,
  server: null,
  failoverChains: {} // Initialize empty failover chains
};

/**
 * Initialize server configuration
 */
export const initServerConfig = () => {
  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? "0.0.0.0";
  const databasePath = process.env.ZSIISTANT_DB_PATH ?? new URL("./data/zsiistant.sqlite", import.meta.url).pathname;
  const webRoot = fileURLToPath(new URL("../../web/", import.meta.url));
  
  return { port, host, databasePath, webRoot };
};

/**
 * Create and configure HTTP server
 */
export const createServerInstance = (port, host) => {
  const server = createServer();
  
  // WebSocket upgrade handler
  server.on('upgrade', (request, socket, head) => {
    handleWebSocketUpgrade(request, socket, head, serverState.websocketServer, serverState.registry);
  });
  
  return server;
};

/**
 * Create server instance with existing WebSocket server
 */
export const createServerInstanceWithWebSocket = (server) => {
  // WebSocket upgrade handler
  server.on('upgrade', (request, socket, head) => {
    handleWebSocketUpgrade(request, socket, head, serverState.websocketServer, serverState.registry);
  });
  
  return server;
};

/**
 * Setup WebSocket server
 */
export const setupWebSocketServer = (server) => {
  const wss = new WebSocketServer({ noServer: true });
  serverState.websocketServer = wss;
  return wss;
};

/**
 * Initialize rate limiting cleanup
 */
export const initializeRateLimiting = () => {
  // Enhanced rate limiting with better security
  const rateLimit = new Map();
  const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  const MAX_REQUESTS_PER_MINUTE = 60;
  const MAX_RATE_LIMIT_ENTRIES = 5000;
  const CONN_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  // Optimized rate limit cleanup with better performance
  serverState.rateLimitCleanupInterval = setInterval(() => {
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
  
  // Start rate limit cleanup
  const rateLimitCleanupInterval = startRateLimitCleanup();
  
  // Clean up on exit
  process.on('SIGINT', () => {
    try {
      if (serverState.rateLimitCleanupInterval) {
        clearInterval(serverState.rateLimitCleanupInterval);
      }
    } catch (err) {
      console.error('Error during rate limit cleanup:', err);
    }
  });
  process.on('SIGTERM', () => {
    try {
      if (serverState.rateLimitCleanupInterval) {
        clearInterval(serverState.rateLimitCleanupInterval);
      }
    } catch (err) {
      console.error('Error during rate limit cleanup:', err);
    }
  });
};

/**
 * Setup job processor
 */
export const setupJobProcessor = (registry) => {
  const broadcastFunction = (job) => {
    broadcastMessage({
      type: 'job_update',
      timestamp: Date.now(),
      data: job
    });
  };
  
  serverState.jobProcessorCleanup = startJobProcessor(registry, broadcastFunction);
  return serverState.jobProcessorCleanup;
};

/**
 * Apply enhanced rate limiting middleware
 */
export const applyRateLimitMiddleware = (server, registry) => {
  server.on('request', async (req, res) => {
    try {
      // Apply rate limiting
      const shouldProceed = applyRateLimit(req, res);
      if (!shouldProceed) {
        return; // Rate limit exceeded, response already sent
      }
      
      // Continue with normal request processing
      const origin = req.headers.origin;
      
      // Handle OPTIONS requests for CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
          "Access-Control-Allow-Origin": origin && origin !== 'null' && origin !== undefined ? origin : "*"
        });
        res.end();
        return;
      }
      
      // Route handling will be done by individual route handlers
      // This is just a placeholder for middleware
      
    } catch (error) {
      handleError(error, req, res);
    }
  });
};



/**
 * Graceful shutdown handler
 */
export const setupGracefulShutdown = (server, registry) => {
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}, starting graceful shutdown...`);
    
    try {
      // Close server
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            console.error('Error closing server:', err);
            reject(err);
          } else {
            console.log('Server closed successfully');
            resolve();
          }
        });
      });
      
      // Stop job processor
      if (serverState.jobProcessorCleanup) {
        serverState.jobProcessorCleanup();
      }
      
      // Clear rate limit cleanup interval
      if (serverState.rateLimitCleanupInterval) {
        clearInterval(serverState.rateLimitCleanupInterval);
      }
      
      // Close database connection if it exists
      if (registry?.db) {
        try {
          registry.db.close();
          console.log('Database connection closed');
        } catch (dbErr) {
          console.error('Error closing database:', dbErr);
        }
      }
      
      // Stop webhook manager
      try {
        await webhookManager.stop();
        console.log('Webhook manager stopped');
      } catch (webhookErr) {
        console.error('Error stopping webhook manager:', webhookErr);
      }
      
      process.exit(0);
    } catch (error) {
      console.error('Graceful shutdown failed:', error);
      process.exit(1);
    }
    
    // Force exit after 10 seconds if graceful shutdown doesn't complete
    setTimeout(() => {
      console.error('Forceful exit after 10 seconds');
      process.exit(1);
    }, 10000);
  };
  
  // Handle shutdown signals
  process.on('SIGINT', () => {
    shutdown('SIGINT').catch(error => {
      console.error('Error during SIGINT shutdown:', error);
      process.exit(1);
    });
  });
  
  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch(error => {
      console.error('Error during SIGTERM shutdown:', error);
      process.exit(1);
    });
  });
};

/**
 * Initialize server with all components
 */
export const initializeServer = async (registry) => {
  const config = initServerConfig();
  
  // Initialize providers
  const providers = await initializeProviders();
  
  // Update settings with provider count
  settings.providers = Object.keys(providers).length;
  
  // Create server instance with WebSocket upgrade handler
  const server = createServerInstance(config.port, config.host);
  
  // Setup WebSocket server
  setupWebSocketServer(server);
  
  // Initialize rate limiting
  initializeRateLimiting();
  
  // Apply rate limiting middleware
  applyRateLimitMiddleware(server, registry);
  
  // Setup error handling
  const setupErrorHandling = (server) => {
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${config.port} is already in use`);
        process.exit(1);
      } else {
        console.error('Server error:', error);
      }
    });
  };
  setupErrorHandling(server);
  
  // Setup job processor
  setupJobProcessor(registry);
  
  // Setup graceful shutdown
  setupGracefulShutdown(server, registry);
  
  // Store server state
  serverState.server = server;
  serverState.registry = registry;
  
  return { server, config, providers };
};

/**
 * Start server
 */
export const startServer = async (server, config) => {
  return new Promise((resolve, reject) => {
    server.listen(config.port, config.host, () => {
      console.log(`Zsiistant v${settings.version} listening on http://${config.host}:${config.port}`);
      console.log(`WebSocket endpoint available at ws://${config.host}:${config.port}/ws`);
      resolve(server);
    });
    
    server.on('error', (error) => {
      reject(error);
    });
  });
};

/**
 * Get server status
 */
export const getServerStatus = () => {
  return {
    uptime: Math.floor((Date.now() - serverState.startTime) / 1000),
    version: settings.version,
    providers: settings.providers,
    maxAgents: settings.maxAgents,
    activeConnections: serverState.totalActiveConnections,
    jobProcessorRunning: serverState.jobProcessorCleanup !== null
  };
};

/**
 * Middleware for common request processing
 */
export const createCommonMiddleware = (registry, providers) => {
  return {
    // Shared utilities across routes
    sendJson,
    sendError,
    handleError,
    readRequestBody,
    applyRateLimit,
    
    // Registry access
    getRegistry: () => registry,
    
    // Provider access
    getProviders: () => providers,
    
    // Settings access
    getSettings: () => settings,
    
    // Server state access
    getServerState: () => serverState,
    
    // Broadcasting functions
    broadcastMessage,
    broadcastAgentStatus
  };
};

export default {
  initServerConfig,
  createServerInstance,
  setupWebSocketServer,
  initializeRateLimiting,
  setupJobProcessor,
  applyRateLimitMiddleware,
  setupGracefulShutdown,
  initializeServer,
  startServer,
  getServerStatus,
  createCommonMiddleware,
  settings,
  serverState
};