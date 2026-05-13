/**
 * Tool Routes - Handle tool-related API endpoints
 */

import { sanitizeError, applyRateLimit } from "../middleware/security.js";
import { readRequestBody } from "../middleware/requestHandler.js";
import { validateToolConfig } from "../tools/tools.js";
export function registerToolRoutes(server, registry, providers, failoverChains, settings) {
  // Tool ID validation pattern
  const toolIdPattern = /^[a-zA-Z0-9-]+$/;

  /**
   * Handle agent tools listing
   */
  const handleAgentTools = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const toolsMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/tools$/);

    if (!toolsMatch) return false;

    const agentId = toolsMatch[1];
    
    // Validate agent ID format
    if (!toolIdPattern.test(agentId) || agentId.length > 64) {
      return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ error: "Invalid agent ID format" }));
    }

    // Check if agent exists
    const agent = registry.getAgent(agentId);
    if (!agent) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                  response.end(JSON.stringify({ error: "Agent not found" }));

    if (request.method === "GET") {
      const tools = registry.getAgentTools(agentId);
      return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ tools }));
    }

    if (request.method === "POST") {
      try {
        // Apply rate limiting
        if (!applyRateLimit(request, response)) {
          return true; // Rate limit exceeded, response already sent
        }
        
        const body = await readRequestBody(request);
        
        // Validate tool creation input
        if (!body.name || typeof body.name !== 'string') {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Tool name is required" }));
        }
        
        if (!body.type || typeof body.type !== 'string') {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Tool type is required" }));
        }
        
        const tool = registry.addAgentTool(agentId, {
          name: body.name,
          type: body.type,
          description: body.description || '',
          config: body.config || null,
          enabled: body.enabled !== undefined ? body.enabled : true
        });
        
        return response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ tool }));
      } catch (err) {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: err.message || "Invalid request body" }));
      }
    }

    return false;
  };

  /**
   * Handle single agent tool operations
   */
  const handleAgentTool = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const toolMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/tools\/([\w-]+)$/);
    
    if (!toolMatch) return false;
    
    const agentId = toolMatch[1];
    const toolId = toolMatch[2];
    
    // Validate IDs format
    if (!toolIdPattern.test(agentId) || agentId.length > 64 || 
        !toolIdPattern.test(toolId) || toolId.length > 64) {
      return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ error: "Invalid ID format" }));
    }

    // Check if agent exists
    const agent = registry.getAgent(agentId);
    if (!agent) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                  response.end(JSON.stringify({ error: "Agent not found" }));

    if (request.method === "GET") {
      const tools = registry.getAgentTools(agentId);
      const tool = tools.find(t => t.id === toolId);
      if (!tool) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                    response.end(JSON.stringify({ error: "Tool not found" }));
      return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ tool }));
    }

    if (request.method === "PATCH") {
      try {
        const body = await readRequestBody(request);
        
        // Validate tool update input
        if (body.name && typeof body.name !== 'string') {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid tool name" }));
        }
        
        if (body.type && typeof body.type !== 'string') {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid tool type" }));
        }
        
        if (body.description && typeof body.description !== 'string') {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid tool description" }));
        }
        
        const tool = registry.updateAgentTool(agentId, toolId, body);
        return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ tool }));
      } catch (err) {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: err.message || "Invalid request body" }));
      }
    }

    if (request.method === "DELETE") {
      const deleted = registry.deleteAgentTool(agentId, toolId);
      if (!deleted) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                    response.end(JSON.stringify({ error: "Tool not found" }));
      return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ deleted: true }));
    }

    return false;
  };

  /**
   * Handle tool execution
   */
  const handleToolExecution = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const executeMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/tools\/([\w-]+)\/execute$/);
    
    if (!executeMatch) return false;
    
    const agentId = executeMatch[1];
    const toolId = executeMatch[2];
    
    // Validate IDs format
    if (!toolIdPattern.test(agentId) || agentId.length > 64 || 
        !toolIdPattern.test(toolId) || toolId.length > 64) {
      return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ error: "Invalid ID format" }));
    }

    // Check if agent exists
    const agent = registry.getAgent(agentId);
    if (!agent) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                  response.end(JSON.stringify({ error: "Agent not found" }));

    // Get the tool
    const tools = registry.getAgentTools(agentId);
    const tool = tools.find(t => t.id === toolId);
    if (!tool) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                  response.end(JSON.stringify({ error: "Tool not found" }));

    if (request.method === "POST") {
      try {
        // Apply rate limiting
        if (!applyRateLimit(request, response)) {
          return true; // Rate limit exceeded, response already sent
        }
        
        const body = await readRequestBody(request);
        
        // Validate execution input
        if (!body.context || typeof body.context !== 'object') {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Execution context is required" }));
        }
        
        // Execute the tool
        const { executeTool } = await import("../tools/tools.js");
        
        const result = await executeTool(tool, body.context);
        
        return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ result }));
      } catch (err) {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: err.message || "Invalid request body" }));
      }
    }

    return false;
  };

  /**
   * Register tool routes
   */
  server.on('request', async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    // Try each handler in order
    const handlers = [
      handleAgentTools,
      handleAgentTool,
      handleToolExecution
    ];

    for (const handler of handlers) {
      try {
        const handled = await handler(request, response);
        if (handled !== false) return; // Handler processed the request
      } catch (error) {
        console.error('Tool route error:', error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }

    // If no handler matched, let the main server handle it
    return false;
  });
}