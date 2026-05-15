/**
 * Provider Routes - Handle all provider-related API endpoints
 */

import { providerSummary, listProviderConnections, getProviderReadinessSummary } from '../shared/simpleShared.js';
import { FailoverChainAdapter } from '../adapters/failover.js';
import { isProviderInFailoverChain, DEFAULT_FAILOVER_CHAIN } from '../middleware/providerManager.js';

export function registerProviderRoutes(server, registry, providers, failoverChains, settings) {
  /**
   * Handle provider summary and health
   */
  const handleProviderSummary = async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/providers")) {
      try {
        const summary = providerSummary();
        
        // Add failover chain information
        summary.failoverChains = Object.keys(failoverChains).map(chainName => ({
          name: chainName,
          providerCount: failoverChains[chainName].failoverChain.length,
          healthy: true, // TODO: Implement provider health endpoint
          default: chainName === DEFAULT_FAILOVER_CHAIN
        }));
        
        summary.totalFailoverChains = Object.keys(failoverChains).length;
        summary.defaultFailoverChain = DEFAULT_FAILOVER_CHAIN;
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(summary));
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
   * Handle provider readiness check
   */
  const handleProviderReadiness = async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/provider-readiness")) {
      try {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          providers: listProviderConnections(process.env),
          summary: getProviderReadinessSummary(process.env)
        }));
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
   * Handle individual provider health
   */
  const handleIndividualHealth = async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/providers/health")) {
      const results = {};
      
      // Create a circular reference checker
      const getCircularReplacer = () => {
        const seen = new WeakSet();
        return (key, value) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
              return "[Circular Reference]";
            }
            seen.add(value);
          }
          return value;
        };
      };
      
      for (const [name, provider] of Object.entries(providers)) {
        try {
          const healthResult = await provider.health();
          // Ensure health result is properly formatted and free of circular references
          const safeResult = {
            ok: healthResult.ok || false,
            models: Array.isArray(healthResult.models) ? healthResult.models.slice(0, 10) : [],
            error: healthResult.error || undefined,
            name: healthResult.name || name
          };
          results[name] = safeResult;
        } catch (e) {
          results[name] = { ok: false, error: e.message || String(e), name };
        }
      }
      
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(results));
      return true;
    }

    return false;
  };

  /**
   * Handle all provider health (including failover chains)
   */
  const handleAllHealth = async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/providers/all-health")) {
      try {
        const healthResults = {
          individualProviders: {},
          failoverChains: {},
          timestamp: Date.now()
        };
        
        // Check individual provider health
        for (const [name, provider] of Object.entries(providers)) {
          try {
            healthResults.individualProviders[name] = await provider.health();
          } catch (e) {
            healthResults.individualProviders[name] = { ok: false, error: e.message };
          }
        }
        
        // Check failover chain health
        for (const [name, chain] of Object.entries(failoverChains)) {
          try {
            healthResults.failoverChains[name] = await chain.health();
          } catch (e) {
            healthResults.failoverChains[name] = { ok: false, error: e.message };
          }
        }
        
        // Calculate overall status
        healthResults.overallHealthy = 
          Object.values(healthResults.individualProviders).some(p => p.ok === true) ||
          Object.values(healthResults.failoverChains).some(c => c.ok === true);
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(healthResults));
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
   * Handle failover chain management
   */
  const handleFailoverChains = async (request, response) => {
    // Handle GET /api/providers/failover
    if (request.method === "GET" && request.url?.startsWith("/api/providers/failover")) {
      try {
        const chains = {};
        
        // Get status of each failover chain
        for (const [chainName, chain] of Object.entries(failoverChains)) {
          try {
            const health = await chain.health();
            const currentProvider = chain.getCurrentProvider();
            
            chains[chainName] = {
              name: chainName,
              healthy: health.ok,
              healthyProviders: health.providers,
              primaryProvider: currentProvider?.name || 'unknown',
              fallbackCount: chain.failoverChain.length - 1,
              providers: chain.failoverChain.map((p, i) => ({
                name: p.name,
                index: i,
                position: i + 1,
                healthy: health.providers[p.name]?.ok || false,
                config: p.config
              })),
              default: chainName === DEFAULT_FAILOVER_CHAIN
            };
          } catch (err) {
            chains[chainName] = {
              name: chainName,
              healthy: false,
              error: err.message,
              providers: chain.failoverChain.map((p, i) => ({
                name: p.name,
                index: i,
                position: i + 1,
                healthy: false,
                config: p.config
              })),
              default: chainName === DEFAULT_FAILOVER_CHAIN
            };
          }
        }
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          chains,
          defaultChain: DEFAULT_FAILOVER_CHAIN,
          totalChains: Object.keys(failoverChains).length,
          availableProviders: Object.keys(providers).filter(name => !isProviderInFailoverChain(name))
        }));
        return true;
      } catch (err) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return true;
      }
    }

    // Handle PUT/POST /api/providers/failover
    if ((request.method === "PUT" || request.method === "POST") && request.url?.startsWith("/api/providers/failover")) {
      try {
        const body = await readRequestBody(request);
        
        // Validate input
        if (!body || typeof body !== 'object') {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Invalid request body" }));
          return true;
        }
        
        const action = body.action || 'create';
        const chainName = body.chainName || DEFAULT_FAILOVER_CHAIN;
        
        if (action === 'create' || action === 'update') {
          // Create or update failover chain
          if (!body.chain || !Array.isArray(body.chain) || body.chain.length === 0) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Chain must be a non-empty array of providers" }));
            return true;
          }
          
          // Validate provider chain
          const validProviderNames = Object.keys(providers);
          for (const providerConfig of body.chain) {
            if (!providerConfig.name || !validProviderNames.includes(providerConfig.name)) {
              response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              response.end(JSON.stringify({ error: `Invalid provider name: ${providerConfig.name}` }));
              return true;
            }
          }
          
          try {
            const failoverChain = new FailoverChainAdapter(
              body.chain.map(p => ({
                name: p.name,
                config: p.config || {}
              })),
              body.config || {}
            );
            
            failoverChains[chainName] = failoverChain;
            
            // Update default chain if specified
            if (body.isDefault) {
              DEFAULT_FAILOVER_CHAIN = chainName;
            }
            
            response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({
              success: true,
              message: `Failover chain '${chainName}' ${action}d successfully`,
              chainName,
              providerCount: body.chain.length,
              isDefault: body.isDefault || false
            }));
            return true;
          } catch (err) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: `Failed to create failover chain: ${err.message}` }));
            return true;
          }
        } else if (action === 'delete') {
          // Delete failover chain
          if (!failoverChains[chainName]) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: `Failover chain '${chainName}' not found` }));
            return true;
          }
          
          delete failoverChains[chainName];
          
          // Update default chain if deleted chain was default
          if (DEFAULT_FAILOVER_CHAIN === chainName && Object.keys(failoverChains).length > 0) {
            DEFAULT_FAILOVER_CHAIN = Object.keys(failoverChains)[0];
          }
          
          response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({
            success: true,
            message: `Failover chain '${chainName}' deleted successfully`
          }));
          return true;
        } else if (action === 'switch') {
          // Switch to a specific provider in chain
          if (!failoverChains[chainName]) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: `Failover chain '${chainName}' not found` }));
            return true;
          }
          
          const providerIndex = body.providerIndex;
          if (typeof providerIndex !== 'number' || providerIndex < 0 || providerIndex >= failoverChains[chainName].providers.length) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Invalid provider index" }));
            return true;
          }
          
          try {
            const newProvider = await failoverChains[chainName].setProvider(providerIndex);
            response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({
              success: true,
              message: `Switched to provider '${newProvider.name}' in chain '${chainName}'`,
              provider: newProvider
            }));
            return true;
          } catch (err) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: `Failed to switch provider: ${err.message}` }));
            return true;
          }
        } else {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Invalid action. Must be: create, update, delete, or switch" }));
          return true;
        }
      } catch (err) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Invalid request body" }));
        return true;
      }
    }

    return false;
  };

  /**
   * Register provider routes
   */
  server.on('request', async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    // Try each handler in order
    const handlers = [
      handleProviderSummary,
      handleProviderReadiness,
      handleIndividualHealth,
      handleAllHealth,
      handleFailoverChains
    ];

    for (const handler of handlers) {
      try {
        const handled = await handler(request, response);
        if (handled !== false) return; // Handler processed the request
      } catch (error) {
        console.error('Provider route error:', error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }

    // If no handler matched, let the main server handle it
    return false;
  });
}