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
import { globalErrorHandler, notFoundHandler, requestLogger } from "./middleware/errorMiddleware.js";

import { settings, serverState, initializeServer, startServer, getServerStatus } from "./config/serverConfig.js";
import { setupGracefulShutdown } from "./config/serverConfig.js";

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
    
    // Register modular route handlers
    console.log("Registering route handlers...");
    registerAgentRoutes(server, registry, providers, serverState.failoverChains || {}, settings);
    registerChatRoutes(server, registry, providers, serverState.failoverChains || {}, settings);
    registerSettingsRoutes(server, registry, providers, serverState.failoverChains || {}, settings);
    registerProviderRoutes(server, registry, providers, serverState.failoverChains || {}, settings);
    registerHealthRoutes(server, registry, providers, serverState.failoverChains || {}, settings);
    
    // Apply request logging middleware
    server.on('request', requestLogger);
    
    // Apply global error handler as the final middleware
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