/**
 * Memory Routes - Handle memory management API endpoints
 */

import { applyRateLimit } from "../middleware/security.js";
import { readRequestBody } from "../middleware/requestHandler.js";
import { MemoryManager } from "../memory/memoryManager.js";

export function registerMemoryRoutes(server, registry, providers, failoverChains, settings) {
  const memoryManager = new MemoryManager(registry);
  
  // Initialize memory manager when routes are registered
  memoryManager.initialize().catch(error => {
    console.error('Failed to initialize MemoryManager:', error);
  });

  /**
   * Handle memory management requests
   */
  const handleMemoryRequests = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    // Extract agent ID and session ID from path
    const pathParts = pathname.split('/');
    const agentId = pathParts[3] || 'default';
    const sessionId = pathParts[4];

    // Validate agent ID (temporarily bypassed for testing)
    if (agentId && agentId !== 'default') {
      // const agent = registry.getAgent(agentId);
      // if (!agent) {
      //   response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      //   response.end(JSON.stringify({ error: "Agent not found" }));
      //   return true;
      // }
    }

    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }

    // Handle different endpoints
    if (request.method === "GET" && pathname === "/api/memory/stats") {
      // Get memory statistics for all sessions
      return handleGetMemoryStats(response);
    }

    if (request.method === "GET" && pathname.startsWith("/api/memory/")) {
      // Get memory statistics for specific agent/session
      return handleGetSessionMemoryStats(agentId, sessionId, response);
    }

    if (request.method === "DELETE" && pathname.startsWith("/api/memory/")) {
      // Clear memory for specific agent/session
      return handleClearMemory(agentId, sessionId, response);
    }

    if (request.method === "GET" && pathname.startsWith("/api/memory/context/")) {
      // Get context window for specific agent/session
      return handleGetContext(agentId, sessionId, response);
    }

    return false; // Not handled by this function
  };

  /**
   * Get memory statistics for all sessions
   */
  const handleGetMemoryStats = async (response) => {
    try {
      // This is a simplified version - in a real implementation, you'd query the database
      const stats = {
        total_sessions: 0,
        total_memories: 0,
        total_summaries: 0,
        agents: {}
      };

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(stats));
    } catch (error) {
      console.error('Error getting memory stats:', error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Failed to get memory statistics" }));
    }
  };

  /**
   * Get memory statistics for specific agent/session
   */
  const handleGetSessionMemoryStats = async (agentId, sessionId, response) => {
    try {
      if (!sessionId) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Session ID is required" }));
        return true;
      }

      const stats = await memoryManager.getMemoryStats(agentId, sessionId);

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        agentId,
        sessionId,
        ...stats
      }));
    } catch (error) {
      console.error('Error getting session memory stats:', error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Failed to get session memory statistics" }));
    }
  };

  /**
   * Clear memory for specific agent/session
   */
  const handleClearMemory = async (agentId, sessionId, response) => {
    try {
      if (!sessionId) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Session ID is required" }));
        return true;
      }

      await memoryManager.clearMemory(agentId, sessionId);

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        success: true,
        agentId,
        sessionId,
        message: "Memory cleared successfully"
      }));
    } catch (error) {
      console.error('Error clearing memory:', error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Failed to clear memory" }));
    }
  };

  /**
   * Get context window for specific agent/session
   */
  const handleGetContext = async (agentId, sessionId, response) => {
    try {
      if (!sessionId) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Session ID is required" }));
        return true;
      }

      const context = await memoryManager.getCompleteContext(agentId, sessionId);

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        agentId,
        sessionId,
        context,
        context_length: context.length
      }));
    } catch (error) {
      console.error('Error getting context:', error);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Failed to get context window" }));
    }
  };

  /**
   * Register memory routes
   */
  server.on('request', async (request, response) => {
    const handled = await handleMemoryRequests(request, response);
    if (handled !== false) return;

    // Let other handlers process the request
  });
}