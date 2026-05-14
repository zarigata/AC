/**
 * Settings Routes - Handle all settings-related API endpoints
 */

import { MAX_REQUESTS_PER_MINUTE } from "../middleware/security.js";
import { MAX_REQUEST_TIMEOUT } from "../middleware/requestHandler.js";
import { readRequestBody } from "../middleware/requestHandler.js";

export function registerSettingsRoutes(server, registry, providers, failoverChains, settings) {
  /**
   * Handle global settings
   */
  const handleGlobalSettings = async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/settings")) {
      // Return current settings
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        ...settings,
        providers: Object.keys(providers).length // Update providers count dynamically
      }));
      return true;
    }

    if (request.method === "PATCH" && request.url?.startsWith("/api/settings")) {
      try {
        const body = await readRequestBody(request);

        // Validate settings input with comprehensive checks
        if (!body || typeof body !== 'object') {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Settings payload must be an object" }));
          return true;
        }
        
        const updates = {};
        const originalSettings = { ...settings, providers: Object.keys(providers).length };
        
        // Validate and process each setting update
        if (body.defaultModel !== undefined) {
          if (typeof body.defaultModel !== 'string' || body.defaultModel.trim().length === 0 || body.defaultModel.length > 120) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Invalid defaultModel: must be a string between 1 and 120 characters" }));
            return true;
          }
          updates.defaultModel = body.defaultModel.trim();
        }
        
        if (body.maxAgents !== undefined) {
          if (!Number.isInteger(body.maxAgents) || body.maxAgents < 1 || body.maxAgents > 1000) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Invalid maxAgents: must be an integer between 1 and 1000" }));
            return true;
          }
          updates.maxAgents = body.maxAgents;
        }
        
        if (body.rateLimit !== undefined) {
          if (!Number.isInteger(body.rateLimit) || body.rateLimit < 1 || body.rateLimit > 10000) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Invalid rateLimit: must be an integer between 1 and 10000" }));
            return true;
          }
          updates.rateLimit = body.rateLimit;
          // Note: Runtime rate limit updates require server restart for full effect
          console.log(`Rate limit updated to: ${body.rateLimit} requests per minute`);
        }
        
        if (body.timeout !== undefined) {
          if (!Number.isInteger(body.timeout) || body.timeout < 1000 || body.timeout > 300000) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Invalid timeout: must be an integer between 1000 and 300000 milliseconds" }));
            return true;
          }
          updates.timeout = body.timeout;
          // Note: Runtime timeout updates require server restart for full effect
          console.log(`Request timeout updated to: ${body.timeout} milliseconds`);
        }
        
        if (body.supportedIsolationModes !== undefined) {
          if (!Array.isArray(body.supportedIsolationModes) || body.supportedIsolationModes.length === 0 || body.supportedIsolationModes.length > 20) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Invalid supportedIsolationModes: must be an array with 1-20 items" }));
            return true;
          }
          
          const validModes = ["isolated", "selective", "mesh"];
          for (const mode of body.supportedIsolationModes) {
            if (typeof mode !== 'string' || !validModes.includes(mode)) {
              response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              response.end(JSON.stringify({ error: `Invalid isolation mode: ${mode}. Must be one of: ${validModes.join(', ')}` }));
              return true;
            }
          }
          updates.supportedIsolationModes = body.supportedIsolationModes;
        }
        
        if (body.supportedLinkModes !== undefined) {
          if (!Array.isArray(body.supportedLinkModes) || body.supportedLinkModes.length === 0 || body.supportedLinkModes.length > 20) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Invalid supportedLinkModes: must be an array with 1-20 items" }));
            return true;
          }
          
          const validModes = ["observe", "message", "delegate"];
          for (const mode of body.supportedLinkModes) {
            if (typeof mode !== 'string' || !validModes.includes(mode)) {
              response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              response.end(JSON.stringify({ error: `Invalid link mode: ${mode}. Must be one of: ${validModes.join(', ')}` }));
              return true;
            }
          }
          updates.supportedLinkModes = body.supportedLinkModes;
        }
        
        if (body.providers !== undefined) {
          if (!Number.isInteger(body.providers) || body.providers < 0 || body.providers > 100) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Invalid providers: must be an integer between 0 and 100" }));
            return true;
          }
          updates.providers = body.providers;
        }
        
        // CORS settings configuration
        if (body.cors !== undefined) {
          if (typeof body.cors !== 'object') {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "CORS settings must be an object" }));
            return true;
          }
          
          const corsUpdates = {};
          
          // Validate allowedOrigins
          if (body.cors.allowedOrigins !== undefined) {
            if (typeof body.cors.allowedOrigins !== 'string') {
              response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              response.end(JSON.stringify({ error: "CORS allowedOrigins must be a string" }));
              return true;
            }
            corsUpdates.allowedOrigins = body.cors.allowedOrigins;
          }
          
          // Validate allowedMethods
          if (body.cors.allowedMethods !== undefined) {
            if (typeof body.cors.allowedMethods !== 'string') {
              response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              response.end(JSON.stringify({ error: "CORS allowedMethods must be a string" }));
              return true;
            }
            corsUpdates.allowedMethods = body.cors.allowedMethods;
          }
          
          // Validate allowedHeaders
          if (body.cors.allowedHeaders !== undefined) {
            if (typeof body.cors.allowedHeaders !== 'string') {
              response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              response.end(JSON.stringify({ error: "CORS allowedHeaders must be a string" }));
              return true;
            }
            corsUpdates.allowedHeaders = body.cors.allowedHeaders;
          }
          
          // Validate exposedHeaders
          if (body.cors.exposedHeaders !== undefined) {
            if (typeof body.cors.exposedHeaders !== 'string') {
              response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              response.end(JSON.stringify({ error: "CORS exposedHeaders must be a string" }));
              return true;
            }
            corsUpdates.exposedHeaders = body.cors.exposedHeaders;
          }
          
          // Validate maxAge
          if (body.cors.maxAge !== undefined) {
            if (!Number.isInteger(body.cors.maxAge) || body.cors.maxAge < 0 || body.cors.maxAge > 86400) {
              response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              response.end(JSON.stringify({ error: "CORS maxAge must be an integer between 0 and 86400" }));
              return true;
            }
            corsUpdates.maxAge = body.cors.maxAge;
          }
          
          // Validate allowCredentials
          if (body.cors.allowCredentials !== undefined) {
            if (typeof body.cors.allowCredentials !== 'boolean') {
              response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              response.end(JSON.stringify({ error: "CORS allowCredentials must be a boolean" }));
              return true;
            }
            corsUpdates.allowCredentials = body.cors.allowCredentials;
          }
          
          // Validate allowAllOrigins
          if (body.cors.allowAllOrigins !== undefined) {
            if (typeof body.cors.allowAllOrigins !== 'boolean') {
              response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              response.end(JSON.stringify({ error: "CORS allowAllOrigins must be a boolean" }));
              return true;
            }
            corsUpdates.allowAllOrigins = body.cors.allowAllOrigins;
          }
          
          // Apply CORS updates
          updates.cors = corsUpdates;
        }
        
        // If no valid updates provided, return error
        if (Object.keys(updates).length === 0) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "No valid settings provided for update" }));
          return true;
        }
        
        // Apply updates to global settings object
        Object.assign(settings, updates);
        
        // Log the settings update for audit trail (sensitive data redacted)
        console.log('Settings updated:', {
          timestamp: Date.now(),
          changedBy: request.headers['x-forwarded-for'] ? '***' : 'localhost',
          updates: Object.keys(updates), // Only log keys, not values
          newSettings: { version: settings.version } // Only safe metadata
        });
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          settings: { ...settings },
          updated: Object.keys(updates),
          timestamp: Date.now()
        }));
        return true;
      } catch (err) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Invalid request body" }));
        return true;
      }
    }

    if (request.method === "GET" && request.url?.startsWith("/api/setup/wizard")) {
      // Check if this is a first-run scenario
      const agents = registry.listAgents();
      const presets = registry.listPresets();
      const hasAnyAgents = agents.length > 0;
      const hasAnyPresets = presets.length > 0;
      
      const wizardState = {
        isFirstRun: !hasAnyAgents && !hasAnyPresets,
        step: 1, // Default first step
        completedSteps: [],
        currentStep: 'welcome',
        nextSteps: ['agent-creation', 'preset-selection', 'configuration', 'testing'],
        data: {
          availableProviders: Object.keys(providers),
          availablePresets: presets.filter(p => p.isActive),
          systemInfo: {
            version: VERSION,
            uptime: Math.floor((Date.now() - startTime) / 1000),
            databasePath: databasePath
          }
        }
      };
      
      // Determine appropriate step based on existing setup
      if (hasAnyAgents) {
        wizardState.currentStep = 'preset-selection';
        wizardState.completedSteps = ['agent-creation'];
      }
      
      if (hasAnyPresets) {
        wizardState.currentStep = 'configuration';
        wizardState.completedSteps = ['agent-creation', 'preset-selection'];
      }
      
      if (hasAnyAgents && hasAnyPresets) {
        wizardState.currentStep = 'testing';
        wizardState.completedSteps = ['agent-creation', 'preset-selection', 'configuration'];
      }
      
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(wizardState));
      return true;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/setup/wizard/complete")) {
      try {
        const body = await readRequestBody(request);
        
        // Validate completion data
        if (!body || typeof body !== 'object') {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Invalid request body" }));
          return true;
        }
        
        // Log wizard completion for analytics
        console.log('Wizard completed:', {
          timestamp: Date.now(),
          stepsCompleted: body.completedSteps || [],
          agentsCreated: body.agentsCreated || 0,
          presetsApplied: body.presetsApplied || 0,
          userPreferences: body.preferences || {}
        });
        
        // Here you could update settings, create agents, apply presets, etc.
        // based on the wizard completion data
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          success: true,
          message: "Setup wizard completed successfully",
          completedAt: Date.now(),
          nextSteps: [
            "Start using your agents",
            "Configure integrations",
            "Customize settings",
            "Explore advanced features"
          ]
        }));
        return true;
      } catch (err) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: err.message || "Invalid request body" }));
        return true;
      }
    }

    return false;
  };

  /**
   * Handle global usage stats
   */
  const handleGlobalUsage = async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/usage")) {
      try {
        const urlParams = new URLSearchParams(request.url.split('?')[1] || '');
        const period = urlParams.get('period') || 'daily';
        
        // Validate period parameter
        const validPeriods = ['daily', 'weekly', 'monthly', 'all'];
        if (!validPeriods.includes(period)) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Invalid period parameter. Must be: daily, weekly, monthly, or all" }));
          return true;
        }
        
        const usage = registry.getUsageStats(period);
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(usage));
        return true;
      } catch (err) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return true;
      }
    }

    return false;
  };

  /**
   * Handle request logs
   */
  const handleRequestLogs = async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/logs")) {
      const logs = registry.getRecentLogs(100);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ logs }));
      return true;
    }

    return false;
  };

  /**
   * Register settings routes
   */
  server.on('request', async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    // Try each handler in order
    const handlers = [
      handleGlobalSettings,
      handleGlobalUsage,
      handleRequestLogs
    ];

    for (const handler of handlers) {
      try {
        const handled = await handler(request, response);
        if (handled !== false) return; // Handler processed the request
      } catch (error) {
        console.error('Settings route error:', error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }

    // If no handler matched, let the main server handle it
    return false;
  });
}