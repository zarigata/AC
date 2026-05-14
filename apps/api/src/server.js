/**
 * Zsiistant Server - Main application entry point with modular architecture
 */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { setInterval } from "node:timers";

import { AgentRegistry } from "./registry.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerProviderRoutes } from "./routes/providers.js";
import { registerHealthRoutes } from "./routes/health.js";
console.log('Health routes imported successfully');
import { registerToolRoutes } from "./routes/tools.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerTokenRoutes } from "./routes/tokenRoutes.js";
import { registerMemoryRoutes } from "./routes/memory.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerPresetRoutes } from "./routes/presets.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { UserManager } from "./database/userManager.js";
import { webhookManager } from "./adapters/webhookManager.js";
import { globalErrorHandler, notFoundHandler, requestLogger } from "./middleware/errorMiddleware.js";
import createRateLimiter from "./middleware/rateLimiter.js";
import createAuthMiddleware from "./middleware/authMiddleware.js";
import createCorsMiddleware from "./middleware/corsMiddleware.js";
import { registerAllTools } from "./tools/tool-handlers.js";


import { settings, serverState, initializeServer, startServer, getServerStatus } from "./config/serverConfig.js";
import { setupGracefulShutdown } from "./config/serverConfig.js";
import { FAILOVER_CONFIG, isFailoverEnabled } from "./config/failoverConfig.js";

// Set global server start time for uptime calculations
global.serverStartTime = Date.now();

/**
 * Main server initialization
 */
async function main() {
  try {
    // Initialize server configuration
    console.log("Initializing Zsiistant server...");

    // Initialize registry (this needs to be done first)
    const databasePath = process.env.ZSIISTANT_DB_PATH ?? new URL("../data/zsiistant.sqlite", import.meta.url).pathname;
    const registry = new AgentRegistry({ databasePath });
    try {
      registry.seed();
      console.log("Registry seeded successfully");
    } catch (seedErr) {
      console.error("Seed error (non-fatal):", seedErr.message);
    }

    // Initialize server with all components
    const { server, config, providers } = await initializeServer(registry);
    
    // Load failover configuration if enabled
    if (isFailoverEnabled()) {
      console.log('🔄 Failover chains configured and ready');
      
      // Log configured failover chains
      for (const [chainName, chainConfig] of Object.entries(FAILOVER_CONFIG.chains)) {
        console.log(`📋 Failover chain '${chainName}': ${chainConfig.chain.map(p => p.name).join(' → ')}`);
      }
    } else {
      console.log('⚠️  Failover disabled');
    }

    // Collect route handlers into an array for sequential processing
    const routeHandlers = [];
    const makeRouteRegistrar = () => ({
      on(event, handler) {
        if (event === 'request') routeHandlers.push(handler);
      }
    });

    const routeServer = makeRouteRegistrar();

    // Register modular route handlers onto our pseudo-server
    console.log("Registering route handlers...");
    console.log('Registering agent routes...');
    registerAgentRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    console.log('Registering chat routes...');
    registerChatRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    console.log('Registering settings routes...');
    registerSettingsRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    console.log('Registering provider routes...');
    registerProviderRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    console.log('Registering health routes...');
    registerHealthRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    console.log('Registering tool routes...');
    registerToolRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    console.log('Registering job routes...');
    registerJobRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    console.log('Registering token routes...');
    registerTokenRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    console.log('Registering memory routes...');
    registerMemoryRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    // Register webhook routes and get the handler function
    const webhookHandler = registerWebhookRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    if (typeof webhookHandler === 'function') {
      routeHandlers.push(webhookHandler);
    }
    console.log('Registering preset routes...');
    registerPresetRoutes(routeServer, registry);

    console.log(`Registered ${routeHandlers.length} route handler(s)`);
    
    // Initialize tool system
    console.log("Initializing tool system...");
    try {
      const { initializeTools } = await import("./tools/tools.js");
      initializeTools();
      console.log("Tool system initialized successfully");
    } catch (toolErr) {
      console.error("Tool system initialization error (non-fatal):", toolErr.message);
    }

    // Initialize webhook manager
    console.log("Initializing webhook manager...");
    try {
      await webhookManager.start();
      console.log("Webhook manager initialized successfully");
    } catch (webhookErr) {
      console.error("Webhook manager initialization error (non-fatal):", webhookErr.message);
    }

    // Initialize rate limiter
    const rateLimiter = createRateLimiter({
      ipWindowMs: 15 * 60 * 1000, // 15 minutes
      ipMaxRequests: 100, // max requests per IP per window
      apiKeyWindowMs: 60 * 1000, // 1 minute  
      apiKeyMaxRequests: 60 // max requests per API key per window
    });
    console.log('Rate limiter initialized');

    // Initialize CORS middleware
    const corsMiddleware = createCorsMiddleware({
      allowedOrigins: settings.cors?.allowedOrigins || process.env.ZSIISTANT_CORS_ORIGINS || 'http://localhost:3000,http://localhost:4000,http://127.0.0.1:3000,http://127.0.0.1:4000,http://localhost:5000,http://127.0.0.1:5000',
      allowCredentials: settings.cors?.allowCredentials !== undefined ? settings.cors.allowCredentials : true,
      allowedMethods: settings.cors?.allowedMethods || 'GET, POST, PATCH, DELETE, OPTIONS, HEAD',
      allowedHeaders: settings.cors?.allowedHeaders || 'Content-Type, Authorization, X-Requested-With, X-API-Key, X-Content-Type-Options',
      exposedHeaders: settings.cors?.exposedHeaders || '',
      maxAge: settings.cors?.maxAge || 86400,
      allowAllOrigins: settings.cors?.allowAllOrigins || false
    });
    
    // Update runtime settings for CORS
    const { updateRuntimeSettings } = await import("./middleware/corsMiddleware.js");
    updateRuntimeSettings(settings);
    console.log('CORS middleware initialized');

    // Initialize user manager for authentication
    const userManager = new UserManager(databasePath);
    try {
      await userManager.initialize();
      console.log('User manager initialized successfully');
    } catch (userErr) {
      console.error('User manager initialization error:', userErr.message);
    }

    // Register auth routes after userManager is initialized
    console.log('Registering auth routes...');
    registerAuthRoutes(routeServer, userManager);
    
    // Initialize authentication middleware
    const authMiddleware = createAuthMiddleware({
      jwtSecret: process.env.ZSIISTANT_JWT_SECRET || 'your-secret-key-change-in-production',
      jwtExpiresIn: '24h'
    });
    console.log('Authentication middleware initialized');

    // Single request dispatcher that runs handlers sequentially
    server.on('request', async (req, res) => {
      try {
        console.log('Request received:', req.method, req.url);
        // Apply CORS middleware first
        corsMiddleware(req, res, () => {});
        
        // Apply rate limiter middleware
        try {
          await new Promise((resolve, reject) => {
            rateLimiter(req, res, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
        } catch (err) {
          // Rate limiter already sent response, so we're done
          return;
        }

        // Apply authentication middleware
        try {
          await new Promise((resolve, reject) => {
            authMiddleware(req, res, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
        } catch (err) {
          // Authentication middleware already sent response, so we're done
          return;
        }

        // Log request
        if (typeof requestLogger === 'function') {
          requestLogger(req, res, () => {});
        }
        
        // Run each route handler sequentially until one handles the request
        console.log('Processing request:', req.method, req.url, 'with', routeHandlers.length, 'handlers');
        let healthHandlerCalled = false;
        
        for (const handler of routeHandlers) {
          if (res.headersSent) break;
          try {
            console.log('Trying handler for:', req.method, req.url);
            await handler(req, res);
            if (req.url?.includes('health')) {
              healthHandlerCalled = true;
            }
          } catch (err) {
            console.error('Route handler error:', err.message);
            if (!res.headersSent) {
              // Use the global error handler for consistent error formatting
              globalErrorHandler(err, req, res, () => {});
            }
            return;
          }
        }
        
        console.log('Health handler called:', healthHandlerCalled, 'for URL:', req.url);
        
        // If no handler responded, send 404
        if (!res.headersSent) {
          notFoundHandler(req, res);
        }
      } catch (err) {
        console.error('Request dispatcher error:', err);
        if (!res.headersSent) {
          globalErrorHandler(err, req, res, () => {});
        }
      }
    });

    // Apply global error handler
    server.on('error', globalErrorHandler);

    // Start server
    console.log("Starting server...");
    await startServer(server, config);

    console.log("Zsiistant server started successfully");

    return { server, registry, providers };

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

/**
 * Handle server lifecycle
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  // Run this script directly
  main().catch(console.error);
}

export { main, serverState, settings, getServerStatus };
