/**
 * WebSocket Chat Routes - Handle WebSocket-specific chat endpoints and real-time messaging
 */

// Configuration constants
const MAX_CONCURRENT_CONNECTIONS = 100; // Default value

import { applyRateLimit } from "../middleware/security.js";
import { sendToClient, broadcastToSession } from "../middleware/webSocketHandler.js";
import { getServerState } from "../config/serverConfig.js";
import { readRequestBody } from "../middleware/requestHandler.js";

export function registerWebSocketRoutes(server, registry, providers, failoverChains, settings) {
  
  /**
   * Handle WebSocket chat endpoint upgrade and connection
   */
  const handleWebSocketChat = async (request, response) => {
    if (request.method !== 'GET' || !request.url?.includes('/ws/chat')) {
      return false; // Not a WebSocket chat request
    }
    
    try {
      // Get the WebSocket server from server state
      const serverState = getServerState();
      const wsServer = serverState?.websocketServer;
      if (!wsServer) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "WebSocket server not available" }));
        return true;
      }
      
      // For now, let the main WebSocket handler process this
      // This route is more for documentation and future specific chat endpoint logic
      return false;
      
    } catch (error) {
      console.error('WebSocket chat route error:', error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Internal server error" }));
      return true;
    }
  };

  /**
   * Handle agent subscription requests for real-time updates
   */
  const handleAgentSubscription = async (request, response) => {
    if (request.method !== 'POST' || !request.url?.startsWith('/api/ws/subscribe')) {
      return false;
    }
    
    try {
      // Apply rate limiting
      if (!applyRateLimit(request, response)) {
        return true; // Rate limit exceeded, response already sent
      }
      
      const body = await readRequestBody(request);
      const { agentId, sessionId } = body;
      
      // Basic validation
      if (!agentId || typeof agentId !== 'string') {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Invalid agent ID" }));
        return true;
      }
      
      // Check if agent exists
      const agent = registry.getAgent(agentId);
      if (!agent) {
        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Agent not found" }));
        return true;
      }
      
      // If sessionId provided, check if session exists
      if (sessionId) {
        const sessions = registry.listSessions(agentId);
        const session = sessions.find(s => s.id === sessionId);
        if (!session) {
          response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Session not found" }));
          return true;
        }
      }
      
      // Return subscription confirmation (actual subscription happens via WebSocket)
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        success: true,
        agentId,
        sessionId: sessionId || null,
        subscribedTo: `agent:${agentId}${sessionId ? `:session:${sessionId}` : ''}`
      }));
      return true;
      
    } catch (error) {
      console.error('Agent subscription error:', error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Internal server error" }));
      return true;
    }
  };

  /**
   * Handle WebSocket connection status endpoint
   */
  const handleWebSocketStatus = async (request, response) => {
    if (request.method !== 'GET' || request.url !== '/api/ws/status') {
      return false;
    }
    
    try {
      // Simple status response for now
      const status = {
        websocket: {
          connected: 0,
          maxConnections: 100,
          status: 'active'
        },
        agents: {
          total: registry.listAgents().length,
          active: registry.listAgents().filter(a => a.status === 'active').length
        },
        uptime: Math.floor((Date.now() - (global.serverStartTime || Date.now())) / 1000)
      };
      
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(status));
      return true;
      
    } catch (error) {
      console.error('WebSocket status error:', error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Internal server error" }));
      return true;
    }
  };

  /**
   * Register WebSocket routes
   */
  server.on('request', async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    // Try each handler in order
    const handlers = [
      handleAgentSubscription,
      handleWebSocketStatus,
      handleWebSocketChat
    ];

    for (const handler of handlers) {
      try {
        const handled = await handler(request, response);
        if (handled !== false) return; // Handler processed the request
      } catch (error) {
        console.error('WebSocket route error:', error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }

    // If no handler matched, let the main server handle it
    return false;
  });
}