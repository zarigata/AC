/**
 * Health Routes - Handle health check endpoints
 */

const VERSION = "1.0.0";
const startTime = Date.now();

export function registerHealthRoutes(server, registry, providers, failoverChains, settings) {
  console.log('Health routes being registered');
  
  // Initialize missing variables with default values
  const totalActiveConnections = 0;
  const rateLimit = { size: 0 };
  const connectedClients = new Set();
  const runningJobs = new Set();
  const databasePath = "unknown";
  const DEFAULT_PROVIDER = providers && Object.keys(providers)[0] || "ollama";
  const VERSION = "1.0.0";
  const startTime = Date.now();

  /**
   * Handle basic health endpoint
   */
  const handleBasicHealth = async (request, response) => {
    console.log('Health route called:', request.method, request.url);
    
    // Check if this is the basic health endpoint
    const path = request.url || "/";
    const isHealthEndpoint = path === "/health" || path === "/";
    
    console.log('Is health endpoint:', isHealthEndpoint, 'Path:', path);
    
    if (isHealthEndpoint && !response.headersSent) {
      console.log('Health endpoint matched, sending response...');
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      const responseBody = JSON.stringify({
        ok: true,
        service: "zsiistant-api",
        version: VERSION,
        uptime: Math.floor((Date.now() - startTime) / 1000)
      });
      console.log('Response body:', responseBody);
      response.end(responseBody);
      console.log('Response sent, returning true');
      return true;
    }
    return false;
  };

  /**
   * Handle advanced health check with system info
   */
  const handleAdvancedHealth = async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/health")) {
      try {
        // Get system metrics
        const systemInfo = {
          uptime: Math.floor((Date.now() - startTime) / 1000),
          memoryUsage: process.memoryUsage(),
          activeConnections: totalActiveConnections,
          rateLimitEntries: rateLimit.size,
          connectedClients: connectedClients.size,
          runningJobs: runningJobs.size
        };

        // Check database health
        let databaseStatus = 'healthy';
        try {
          const testAgent = registry.getAgent('test-health-check');
          if (!testAgent) {
            // Try to create a test agent and immediately delete it
            const test = registry.createAgent({
              name: 'test-health-check',
              purpose: 'System health check',
              provider: 'ollama',
              model: 'qwen3:1.7b',
              isolationMode: 'isolated',
              maxConcurrentTasks: 1,
              peerAccess: {}
            });
            if (test) {
              registry.deleteAgent('test-health-check');
            }
          }
        } catch (dbErr) {
          databaseStatus = 'unhealthy';
          console.error('Database health check failed:', dbErr.message);
        }

        // Check provider health
        const providerHealth = {};
        for (const [name, provider] of Object.entries(providers)) {
          try {
            const health = await provider.health();
            providerHealth[name] = {
              ok: health.ok,
              models: health.models?.slice(0, 5) || [],
              latency: health.latency || 0,
              lastCheck: Date.now()
            };
          } catch (err) {
            providerHealth[name] = {
              ok: false,
              error: err.message,
              lastCheck: Date.now()
            };
          }
        }

        // Calculate overall health
        const overallHealthy = databaseStatus === 'healthy' && 
                              Object.values(providerHealth).some(p => p.ok === true);

        const healthResponse = {
          ok: overallHealthy,
          service: "zsiistant-api",
          version: VERSION,
          uptime: systemInfo.uptime,
          timestamp: Date.now(),
          system: systemInfo,
          database: {
            status: databaseStatus,
            path: databasePath
          },
          providers: providerHealth,
          summary: {
            totalProviders: Object.keys(providers).length,
            healthyProviders: Object.values(providerHealth).filter(p => p.ok).length,
            unhealthyProviders: Object.values(providerHealth).filter(p => !p.ok).length
          },
          features: {
            rateLimiting: true,
            failoverChains: Object.keys(failoverChains).length > 0,
            jobProcessing: true,
            sessionPersistence: true,
            fileUpload: true,
            memoryManagement: true
          }
        };

        // Set appropriate status code
        const statusCode = overallHealthy ? 200 : 503;
        response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(healthResponse));
        return true;
      } catch (err) {
        response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          ok: false,
          error: "Health check failed",
          timestamp: Date.now(),
          message: err.message
        }));
        return true;
      }
    }

    return false;
  };

  /**
   * Handle readiness probe
   */
  const handleReadiness = async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/ready")) {
      try {
        // Check if we can access the registry
        const agents = registry.listAgents();
        const hasBasicFunctionality = Array.isArray(agents);

        // Check primary provider health
        let primaryProviderHealthy = false;
        const primaryProvider = providers[DEFAULT_PROVIDER];
        if (primaryProvider) {
          try {
            const health = await primaryProvider.health();
            primaryProviderHealthy = health.ok;
          } catch (err) {
            console.error('Primary provider health check failed:', err.message);
          }
        }

        const isReady = hasBasicFunctionality && primaryProviderHealthy;

        const readinessResponse = {
          ok: isReady,
          status: isReady ? 'ready' : 'not_ready',
          timestamp: Date.now(),
          checks: {
            registry: hasBasicFunctionality,
            primaryProvider: primaryProviderHealthy,
            database: true // Assumed healthy if we can list agents
          },
          details: {
            totalAgents: agents.length,
            defaultProvider: DEFAULT_PROVIDER,
            providerHealthy: primaryProviderHealthy
          }
        };

        const statusCode = isReady ? 200 : 503;
        response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(readinessResponse));
        return true;
      } catch (err) {
        response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          ok: false,
          status: 'not_ready',
          timestamp: Date.now(),
          error: "Readiness check failed",
          message: err.message
        }));
        return true;
      }
    }

    return false;
  };

  /**
   * Handle liveness probe
   */
  const handleLiveness = async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/live")) {
      try {
        // Simple liveness check - just verify the process is running
        const livenessResponse = {
          ok: true,
          status: 'alive',
          timestamp: Date.now(),
          pid: process.pid,
          uptime: Math.floor((Date.now() - startTime) / 1000),
          memory: process.memoryUsage(),
          version: VERSION
        };

        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(livenessResponse));
        return true;
      } catch (err) {
        response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          ok: false,
          status: 'dead',
          timestamp: Date.now(),
          error: "Liveness check failed",
          message: err.message
        }));
        return true;
      }
    }

    return false;
  };

  /**
   * Create health route handler
   */
  const handleHealthRoutes = async (request, response) => {
    // Try each handler in order
    const handlers = [
      handleBasicHealth,
      handleAdvancedHealth,
      handleReadiness,
      handleLiveness
    ];

    for (const handler of handlers) {
      try {
        if (!response.headersSent) {
          const handled = await handler(request, response);
          if (handled !== false) return true; // Handler processed the request
        }
      } catch (error) {
        console.error('Health route error:', error);
        // Only write error response if headers haven't been sent yet
        if (!response.headersSent) {
          try {
            response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Internal server error", message: error.message }));
          } catch (writeError) {
            console.error('Failed to write error response:', writeError);
          }
        }
        return true;
      }
    }

    return false; // No handler matched
  };

  // Register the health handler with the server
  server.on('request', handleHealthRoutes);
  
  console.log('Health routes registered successfully');
}