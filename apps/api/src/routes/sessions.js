/**
 * Session Routes - Handle all chat session API endpoints
 */

import { applyRateLimit } from "../middleware/security.js";
import { readRequestBody } from "../middleware/requestHandler.js";
import { sessionManager } from "../database/sessionManager.js";
import TokenManager from "../token/tokenManager.js";

export function registerSessionRoutes(server, registry, providers, failoverChains, settings) {
  // Initialize token manager for session operations
  const tokenManager = new TokenManager(registry);
  
  /**
   * GET /api/sessions - List all sessions for the authenticated user
   */
  const handleListSessions = async (req, res) => {
    if (req.method !== "GET" || !req.url?.startsWith("/api/sessions")) return false;
    
    try {
      // Apply rate limiting
      if (!applyRateLimit(req, res)) {
        return true; // Rate limit exceeded, response already sent
      }
      
      // Extract user ID from authenticated request
      const userId = req.user?.id;
      if (!userId) {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return true;
      }
      
      // Get user sessions
      const sessions = await sessionManager.getUserSessions(userId, 20);
      
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ success: true, sessions }));
      return true;
      
    } catch (error) {
      console.error("Error listing sessions:", error);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Failed to list sessions" }));
      return true;
    }
  };
  
  /**
   * POST /api/sessions - Create a new session
   */
  const handleCreateSession = async (req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/api/sessions")) return false;
    
    try {
      // Apply rate limiting
      if (!applyRateLimit(req, res)) {
        return true; // Rate limit exceeded, response already sent
      }
      
      const body = await readRequestBody(req);
      const { name, agentId } = body;
      
      // Extract user ID from authenticated request
      const userId = req.user?.id;
      if (!userId) {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return true;
      }
      
      // Validate required fields
      if (!name || !agentId) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Name and agentId are required" }));
        return true;
      }
      
      // Create session using the registry
      const session = registry.createSession(agentId, { 
        title: name,
        user_id: userId 
      });
      
      if (!session) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Failed to create session" }));
        return true;
      }
      
      res.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ 
        success: true, 
        session: {
          id: session.id,
          title: session.title,
          agentId: session.agentId,
          createdAt: session.createdAt,
          status: session.status
        }
      }));
      return true;
      
    } catch (error) {
      console.error("Error creating session:", error);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Failed to create session" }));
      return true;
    }
  };
  
  /**
   * GET /api/sessions/:sessionId - Get specific session details
   */
  const handleGetSession = async (req, res) => {
    if (req.method !== "GET" || !req.url?.startsWith("/api/sessions/") || req.url === "/api/sessions") return false;
    
    try {
      // Apply rate limiting
      if (!applyRateLimit(req, res)) {
        return true; // Rate limit exceeded, response already sent
      }
      
      const sessionId = req.url.split('/').pop();
      const userId = req.user?.id;
      
      if (!userId) {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return true;
      }
      
      // Get session details
      const session = await sessionManager.getSession(sessionId);
      
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return true;
      }
      
      // Check if user owns this session
      if (session.user_id !== userId) {
        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Access denied" }));
        return true;
      }
      
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ success: true, session }));
      return true;
      
    } catch (error) {
      console.error("Error getting session:", error);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Failed to get session" }));
      return true;
    }
  };
  
  /**
   * DELETE /api/sessions/:sessionId - Delete a session
   */
  const handleDeleteSession = async (req, res) => {
    if (req.method !== "DELETE" || !req.url?.startsWith("/api/sessions/")) return false;
    
    try {
      // Apply rate limiting
      if (!applyRateLimit(req, res)) {
        return true; // Rate limit exceeded, response already sent
      }
      
      const sessionId = req.url.split('/').pop();
      const userId = req.user?.id;
      
      if (!userId) {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return true;
      }
      
      // Get session to check ownership
      const session = await sessionManager.getSession(sessionId);
      
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return true;
      }
      
      // Check if user owns this session
      if (session.user_id !== userId) {
        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Access denied" }));
        return true;
      }
      
      // Delete session
      const deleted = await sessionManager.deleteSession(sessionId);
      
      if (deleted) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: true, message: "Session deleted" }));
      } else {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Failed to delete session" }));
      }
      
      return true;
      
    } catch (error) {
      console.error("Error deleting session:", error);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Failed to delete session" }));
      return true;
    }
  };
  
  /**
   * PATCH /api/sessions/:sessionId - Update a session
   */
  const handleUpdateSession = async (req, res) => {
    if (req.method !== "PATCH" || !req.url?.startsWith("/api/sessions/")) return false;
    
    try {
      // Apply rate limiting
      if (!applyRateLimit(req, res)) {
        return true; // Rate limit exceeded, response already sent
      }
      
      const sessionId = req.url.split('/').pop();
      const body = await readRequestBody(req);
      const userId = req.user?.id;
      
      if (!userId) {
        res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return true;
      }
      
      // Get session to check ownership
      const session = await sessionManager.getSession(sessionId);
      
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return true;
      }
      
      // Check if user owns this session
      if (session.user_id !== userId) {
        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Access denied" }));
        return true;
      }
      
      // Update session
      const updated = await sessionManager.updateSession(sessionId, body);
      
      if (updated) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: true, session: updated }));
      } else {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Failed to update session" }));
      }
      
      return true;
      
    } catch (error) {
      console.error("Error updating session:", error);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Failed to update session" }));
      return true;
    }
  };
  
  // Register the route handlers
  server.on('request', handleListSessions);
  server.on('request', handleCreateSession);
  server.on('request', handleGetSession);
  server.on('request', handleDeleteSession);
  server.on('request', handleUpdateSession);
  
  console.log('Session routes registered successfully');
}