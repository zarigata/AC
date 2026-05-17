/**
 * Zsiistant Server - Main application entry point with modular architecture
 */

import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { setInterval } from "node:timers";
import { broadcastMessage } from "./middleware/webSocketHandler.js";

import { AgentRegistry } from "./registry.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerProviderRoutes } from "./routes/providers.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerLinksRoutes } from "./routes/links.js";
import { registerTaskRoutes } from "./routes/tasks.js";
console.log('Health routes imported successfully');
import { registerTopologyRoutes } from "./routes/topology.js";
import { registerToolRoutes } from "./routes/tools.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerTokenRoutes } from "./routes/tokenRoutes.js";
import { registerMemoryRoutes } from "./routes/memory.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerPresetRoutes } from "./routes/presets.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDocumentationRoutes } from "./routes/documentation.js";
import { registerWebSocketRoutes } from "./routes/websocket.js";
import { registerMonitoringRoutes } from "./routes/monitoring.js";
import { UserManager } from "./database/userManager.js";
import { webhookManager } from "./adapters/webhookManager.js";
import { globalErrorHandler, notFoundHandler, requestLogger } from "./middleware/errorMiddleware.js";
import createRateLimiter from "./middleware/rateLimiter.js";
import createAuthMiddleware from "./middleware/authMiddleware.js";
import createCorsMiddleware from "./middleware/corsMiddleware.js";
import { registerAllTools } from "./tools/tool-handlers.js";

import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { settings, serverState, initializeServer, startServer, getServerStatus } from "./config/serverConfig.js";
import { setupGracefulShutdown } from "./config/serverConfig.js";
import { FAILOVER_CONFIG, isFailoverEnabled } from "./config/failoverConfig.js";
import { createHealthMonitor } from "./monitoring/healthMonitor.js";
import { createTaskManager } from "./monitoring/taskManager.js";

// Set global server start time for uptime calculations
global.serverStartTime = Date.now();

/**
 * Static file serving handler for the web UI
 */
const handleStaticFile = async (request, response) => {
  const url = new URL(request.url ?? "", `http://${request.headers.host ?? "localhost"}`);

  // Only handle GET requests for static files
  if (request.method !== "GET") {
    return false;
  }

  // Map URL paths to file paths
  let filePath;
  if (url.pathname === '/' || url.pathname === '/index.html') {
    filePath = join(process.cwd(), 'apps', 'web', 'index.html');
  } else if (url.pathname.startsWith('/src/')) {
    filePath = join(process.cwd(), 'apps', 'web', url.pathname);
  } else {
    return false; // Not a static file request we handle
  }

  try {
    const fileStats = await stat(filePath);
    if (fileStats.isFile()) {
      const fileContent = await readFile(filePath);

      // Set appropriate content type based on file extension
      const ext = filePath.split('.').pop().toLowerCase();
      let contentType = 'text/html';
      if (ext === 'css') contentType = 'text/css';
      if (ext === 'js') contentType = 'application/javascript';

      response.writeHead(200, { 'Content-Type': contentType });
      response.end(fileContent);
      return true;
    }
  } catch (error) {
    // File not found or other error - let other handlers try
    return false;
  }

  return false;
};

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

    // Set global registry reference for session manager token tracking
    global.registry = registry;

    // Initialize enhanced monitoring systems
    console.log("Initializing monitoring systems...");
    try {
      // Initialize health monitor for real-time provider health checking
      const healthMonitor = createHealthMonitor(registry);
      healthMonitor.start();
      global.healthMonitor = healthMonitor;
      console.log("🏥 Health monitor initialized and started");

      // Initialize task manager for enhanced task tracking and lifecycle management
      const taskManager = createTaskManager(registry);
      global.taskManager = taskManager;
      console.log("📋 Task manager initialized");

      // Set up task integration with WebSocket for real-time updates
      if (taskManager) {
        taskManager.onTaskChange((taskEvent) => {
          try {
            const { task, event } = taskEvent;
            const broadcastMessage = {
              type: 'task_update',
              timestamp: Date.now(),
              event,
              task: {
                id: task.id,
                type: task.type,
                status: task.status,
                progress: task.progress,
                priority: task.priority,
                createdAt: task.createdAt,
                startedAt: task.startedAt,
                completedAt: task.completedAt
              }
            };

            // Broadcast to all connected clients
            broadcastMessage(broadcastMessage);
          } catch (error) {
            console.error('Error broadcasting task update:', error);
          }
        });
      }

    } catch (monitorError) {
      console.error('Error initializing monitoring systems:', monitorError.message);
      // Continue without monitoring, but log the error
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
    const healthRouteHandler = registerHealthRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    console.log('🏥 Health route handler returned:', typeof healthRouteHandler, healthRouteHandler ? 'function' : 'null');
    if (typeof healthRouteHandler === 'function') {
      routeHandlers.push(healthRouteHandler);
      console.log('🏥 Health route handler added to routeHandlers array');
    } else {
      console.log('🏥 Health route handler not added to routeHandlers array');
    }
    console.log('Health routes registered successfully');
    console.log('Total route handlers after registration:', routeHandlers.length);
    console.log('Registering topology routes...');
    registerTopologyRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    console.log('Registering links routes...');
    registerLinksRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    console.log('Registering WebSocket routes...');
    registerWebSocketRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
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
    console.log('Registering documentation routes...');
    registerDocumentationRoutes(routeServer);
    console.log('Registering monitoring routes...');
    registerMonitoringRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);
    console.log('Registering task routes...');
    registerTaskRoutes(routeServer, registry, providers, serverState.failoverChains || {}, settings);

    console.log(`Registered ${routeHandlers.length + 1} route handler(s)`);

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
        const startTime = Date.now();
        console.log('Request received:', req.method, req.url);
        
        // Handle health endpoints directly (bypass all middleware)
        if (req.method === 'GET' && (req.url === '/health' || req.url === '/health/')) {
          console.log('🏥 Direct health endpoint called');
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({
            ok: true,
            service: "zsiistant-api",
            version: "1.0.0",
            uptime: Math.floor((Date.now() - startTime) / 1000)
          }));
          return;
        }
        
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

        // Try static file serving first
        if (!res.headersSent) {
          try {
            const staticHandled = await handleStaticFile(req, res);
            if (staticHandled) {
              console.log('Static file served:', req.method, req.url);
              return; // Static file was served, we're done
            }
          } catch (err) {
            console.error('Static file serving error:', err.message);
            if (!res.headersSent) {
              globalErrorHandler(err, req, res, () => {});
            }
            return;
          }
        }

        // Run each route handler sequentially until one handles the request
        console.log('Processing request:', req.method, req.url, 'with', routeHandlers.length, 'handlers');
        let healthHandlerCalled = false;

        for (const [index, handler] of routeHandlers.entries()) {
          if (res.headersSent) break;
          try {
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

        // If no handler responded, send 404
        if (!res.headersSent) {
          notFoundHandler(req, res);
        }
      } catch (err) {
        console.error('Route handler error:', err.message);
        if (!res.headersSent) {
          // Use the global error handler for consistent error formatting
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

    // Log initial monitoring status
    try {
      if (global.healthMonitor) {
        const systemHealth = global.healthMonitor.getSystemHealth();
        console.log('🏥 Initial system health:', systemHealth.status);

        if (systemHealth.status !== 'healthy') {
          console.warn('⚠️ System health issues detected:', systemHealth);
        }
      }

      if (global.taskManager) {
        const taskStats = global.taskManager.getTaskStats();
        console.log(`📋 Task manager initialized: ${taskStats.total} tasks tracked (${taskStats.active} active)`);
      }
    } catch (statusError) {
      console.error('Error checking initial monitoring status:', statusError.message);
    }

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
