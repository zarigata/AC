/**
 * Token Usage Tracking Routes - API endpoints for token usage management
 */

import { z } from "zod";
import { readRequestBody } from "../middleware/requestHandler.js";
import TokenManager from "../token/tokenManager.js";

/**
 * Validation schemas
 */
const sessionUsageSchema = z.object({
  sessionId: z.string().min(1).max(64)
});

const agentUsageSchema = z.object({
  agentId: z.string().min(1).max(64),
  timeRange: z.enum(["1d", "7d", "30d", "90d"]).optional().default("7d")
});

const systemUsageSchema = z.object({
  timeRange: z.enum(["1d", "7d", "30d", "90d"]).optional().default("7d")
});

const messageTokenSchema = z.object({
  messageId: z.string().min(1).max(64),
  tokensIn: z.number().min(0).max(1000000),
  tokensOut: z.number().min(0).max(1000000)
});

const resetTokenSchema = z.object({
  sessionId: z.string().min(1).max(64).optional(),
  messageId: z.string().min(1).max(64).optional()
}).refine(data => data.sessionId || data.messageId, {
  message: "Either sessionId or messageId must be provided"
});

/**
 * Register token usage tracking routes
 */
export function registerTokenRoutes(server, registry, providers, failoverChains, settings) {
  const tokenManager = new TokenManager(registry);

  /**
   * Handle session token usage statistics
   * GET /api/tokens/sessions?sessionId=:sessionId
   */
  const handleSessionUsage = async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/tokens/sessions")) {
      try {
        // Get query parameters
        const url = new URL(request.url, `http://${request.headers.host}`);
        const sessionId = url.searchParams.get("sessionId");
        
        if (!sessionId) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "sessionId parameter is required" }));
          return true;
        }
        
        // Validate session belongs to this agent
        const session = registry.getSession(sessionId);
        if (!session) {
          response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Session not found" }));
          return true;
        }
        
        const usage = await tokenManager.getSessionUsage(sessionId);
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          success: true,
          data: usage
        }));
        
        return true;
      } catch (error) {
        console.error("Error getting session token usage:", error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return true;
      }
    }
    return false; // Not handled by this function
  };

  /**
   * Handle agent token usage statistics
   * GET /api/tokens/agents/:agentId?timeRange=:timeRange
   */
  const handleAgentUsage = async (request, response) => {
    if (request.method === "GET" && request.url?.startsWith("/api/tokens/agents/")) {
      try {
        const agentId = request.url.split("/")[3];
        const url = new URL(request.url, `http://${request.headers.host}`);
        const timeRange = url.searchParams.get("timeRange") || "7d";
        
        // Validate agent exists
        const agent = registry.getAgent(agentId);
        if (!agent) {
          response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Agent not found" }));
          return true;
        }
        
        const usage = await tokenManager.getAgentUsage(agentId, timeRange);
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          success: true,
          data: usage
        }));
        
        return true;
      } catch (error) {
        console.error("Error getting agent token usage:", error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return true;
      }
    }
    return false; // Not handled by this function
  };

  /**
   * Handle system-wide token usage statistics
   * GET /api/tokens/system?timeRange=:timeRange
   */
  const handleSystemUsage = async (request, response) => {
    if (request.method === "GET" && request.url === "/api/tokens/system") {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const timeRange = url.searchParams.get("timeRange") || "7d";
        
        const usage = await tokenManager.getSystemUsage(timeRange);
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          success: true,
          data: usage
        }));
        
        return true;
      } catch (error) {
        console.error("Error getting system token usage:", error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return true;
      }
    }
    return false; // Not handled by this function
  };

  /**
   * Handle usage statistics and analytics
   * GET /api/tokens/stats?timeRange=:timeRange
   */
  const handleUsageStats = async (request, response) => {
    if (request.method === "GET" && request.url === "/api/tokens/stats") {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const timeRange = url.searchParams.get("timeRange") || "7d";
        
        const stats = await tokenManager.getUsageStats(timeRange);
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          success: true,
          data: stats
        }));
        
        return true;
      } catch (error) {
        console.error("Error getting token stats:", error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return true;
      }
    }
    return false; // Not handled by this function
  };

  /**
   * Handle model pricing information
   * GET /api/tokens/pricing
   */
  const handleModelPricing = async (request, response) => {
    if (request.method === "GET" && request.url === "/api/tokens/pricing") {
      try {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          success: true,
          data: {
            pricing: tokenManager.pricing,
            models: Object.keys(tokenManager.pricing)
          }
        }));
        
        return true;
      } catch (error) {
        console.error("Error getting pricing information:", error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return true;
      }
    }
    return false; // Not handled by this function
  };

  /**
   * Handle cost estimation for a message
   * POST /api/tokens/estimate-cost
   */
  const handleCostEstimation = async (request, response) => {
    if (request.method === "POST" && request.url === "/api/tokens/estimate-cost") {
      try {
        // Parse request body
        const body = await readRequestBody(request);
        
        // Validate input
        const inputSchema = z.object({
          content: z.string().min(1),
          role: z.enum(["user", "assistant", "system"]).optional().default("user"),
          model: z.string().optional().default("default")
        });
        
        const validation = inputSchema.safeParse(body);
        
        if (!validation.success) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Invalid input data", details: validation.error.details }));
          return true;
        }
        
        const { content, role, model } = validation.data;
        
        // Estimate token counts
        const tokensIn = tokenManager.countTokens(content);
        const tokensOut = role === "assistant" ? tokenManager.countTokens(content) : 0; // Estimate for assistant responses
        
        // Calculate cost
        const cost = tokenManager.calculateCost(tokensIn, tokensOut, model);
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          success: true,
          data: {
            content,
            role,
            model,
            estimatedTokens: {
              input: tokensIn,
              output: tokensOut
            },
            cost
          }
        }));
        
        return true;
      } catch (error) {
        console.error("Error estimating cost:", error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return true;
      }
    }
    return false; // Not handled by this function
  };

  // Register the main token routes handler
  server.on("request", async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    // Try each token handler in order
    const handlers = [
      handleSessionUsage,
      handleAgentUsage,
      handleSystemUsage,
      handleUsageStats,
      handleModelPricing,
      handleCostEstimation
    ];

    for (const handler of handlers) {
      try {
        const handled = await handler(request, response);
        if (handled !== false) return; // Handler processed the request
      } catch (error) {
        console.error("Token route error:", error);
        if (!response.headersSent) {
          response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Internal server error" }));
        }
        return;
      }
    }
  });

  console.log("Token usage tracking routes registered");
}
