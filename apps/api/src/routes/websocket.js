/**
 * WebSocket Chat Routes - Handle WebSocket-specific chat endpoints and real-time messaging
 */

// Configuration constants
const MAX_CONCURRENT_CONNECTIONS = 100; // Default value

import { applyRateLimit } from "../middleware/security.js";
import { sendToClient, broadcastToSession } from "../middleware/webSocketHandler.js";
import { serverState } from "../config/serverConfig.js";
import { readRequestBody } from "../middleware/requestHandler.js";

export function registerWebSocketRoutes(server, registry, providers, failoverChains, settings) {
  
  /**
   * Handle WebSocket chat endpoint upgrade and connection
   */
  const handleWebSocketChat = async (request, response) => {
    if (request.method !== 'GET' || !request.url?.includes('/ws')) {
      return false; // Not a WebSocket request
    }
    
    try {
      // Get the WebSocket server from server state
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
    console.log('🔍 handleWebSocketStatus called with:', { method: request.method, url: request.url });
    if (request.method !== 'GET' || request.url !== '/api/ws/status') {
      console.log('🔍 handleWebSocketStatus: URL mismatch, returning false');
      return false;
    }
    
    try {
      console.log('🔍 handleWebSocketStatus: About to send response');
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
      
      console.log('🔍 handleWebSocketStatus: About to writeHead and end response');
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(status));
      console.log('🔍 handleWebSocketStatus: Response sent, returning true');
      return true;
      
    } catch (error) {
      console.error('WebSocket status error:', error);
      console.log('🔍 handleWebSocketStatus: Error caught, trying to send error response');
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: 'Internal server error in status endpoint' }));
      console.log('🔍 handleWebSocketStatus: Error response sent, returning true');
      return true;
    }
  };

  /**
   * Main WebSocket route handler
   */
  const handleWebSocketRoutes = async (request, response) => {
    console.log('🔍 WebSocket routes handler called for:', request.method, request.url);
    
    // Try each handler in order
    const handlers = [
      handleAgentSubscription,
      handleWebSocketStatus,
      handleWebSocketChat
    ];

    for (const handler of handlers) {
      try {
        console.log('🔍 Trying WebSocket handler:', handler.name || 'anonymous');
        const handled = await handler(request, response);
        console.log('🔍 WebSocket handler returned:', handled);
        if (handled !== false) {
          console.log('🔍 WebSocket handler processed request, returning true');
          return true; // Handler processed the request
        }
      } catch (error) {
        console.error('🔍 WebSocket route error:', error);
        // Only write error response if headers haven't been sent yet
        if (!response.headersSent) {
          try {
            response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Internal server error", message: error.message }));
            console.log('🔍 WebSocket error response sent');
          } catch (writeError) {
            console.error('🔍 Failed to write WebSocket error response:', writeError);
          }
        }
        console.log('🔍 WebSocket error handler completed, returning true');
        return true;
      }
    }

    console.log('🔍 No WebSocket handler matched, returning false');
    return false; // No handler matched
  };
  
  // Return the main WebSocket handler
  return handleWebSocketRoutes;
}