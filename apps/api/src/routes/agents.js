/**
 * Agent Routes - Handle all agent-related API endpoints
 */

import { sanitizeError, applyRateLimit } from "../middleware/security.js";
import { readRequestBody } from "../middleware/requestHandler.js";
import { createAgentSchema, updateAgentSchema } from "../middleware/validationMiddleware.js";
import { parseCreateAgentInput } from "../shared/simpleShared.js";
export function registerAgentRoutes(server, registry, providers, failoverChains, settings) {
  // Agent ID validation pattern
  const agentIdPattern = /^[a-zA-Z0-9-]+$/;

  /**
   * Handle single agent operations
   */
  const handleSingleAgent = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const agentMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)$/);
    
    // If the URL has more path after the agent ID, this handler shouldn't process it
    if (agentMatch && url.pathname.length > agentMatch[0].length) {
      return false;
    }

    if (!agentMatch) return false;
    
    // Authentication is handled by global middleware

    const agentId = agentMatch[1];

    // Enhanced agent ID validation with comprehensive security checks
    if (!agentId || typeof agentId !== 'string' || agentId.length > 64 || agentId.length < 1) {
      return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ error: "Invalid agent ID format" }));
    }

    // Check for SQL injection patterns
    const sqlKeywords = ['select', 'insert', 'update', 'delete', 'drop', 'create', 'alter', 'union', 'exec', 'execute', 'script', 'javascript', 'iframe'];
    const dangerousPatterns = [
      /;\s*--/,
      /'\s*or\s*1=1/i,
      /\b(and|or)\s*\d+=\d+/i,
      /\b(and|or)\s*'\s*=/i,
      /<script[^>]*>/i,
      /javascript:/i,
      /<iframe/i
    ];

    const lowerAgentId = agentId.toLowerCase();
    for (const keyword of sqlKeywords) {
      if (lowerAgentId.includes(keyword)) {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Invalid agent ID: contains potentially malicious content" }));
      }
    }

    for (const pattern of dangerousPatterns) {
      if (pattern.test(agentId)) {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Invalid agent ID: contains potentially malicious content" }));
      }
    }

    // Check for potentially dangerous agent IDs
    if (agentId.toLowerCase().includes('admin') || 
        agentId.toLowerCase().includes('system') || 
        agentId.toLowerCase().includes('root')) {
      return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ error: "Invalid agent ID: reserved name" }));
    }

    // Apply rate limiting for agent access
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }

    if (request.method === "GET") {
      const agent = registry.getAgent(agentId);
      if (!agent) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                    response.end(JSON.stringify({ error: "Agent not found" }));
      return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ agent }));
    }

    if (request.method === "PATCH") {
      try {
        const body = await readRequestBody(request);
        
        // Validate update input
        if (body.name && (typeof body.name !== 'string' || body.name.length > 80)) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid agent name" }));
        }
        
        if (body.purpose && (typeof body.purpose !== 'string' || body.purpose.length > 240)) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid agent purpose" }));
        }
        
        if (body.systemPrompt && (typeof body.systemPrompt !== 'string' || body.systemPrompt.length > 2000)) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid systemPrompt: must be no more than 2000 characters" }));
        }
        
        if (body.maxConcurrentTasks && (!Number.isInteger(body.maxConcurrentTasks) || body.maxConcurrentTasks < 1 || body.maxConcurrentTasks > 32)) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid maxConcurrentTasks" }));
        }
        
        const agent = registry.updateAgent(agentId, body);
        if (!agent) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                    response.end(JSON.stringify({ error: "Agent not found" }));
        return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ agent }));
      } catch (err) {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Invalid request body" }));
      }
    }

    if (request.method === "DELETE") {
      const deleted = registry.deleteAgent(agentId);
      if (!deleted) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                    response.end(JSON.stringify({ error: "Agent not found" }));
      return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ deleted: true }));
    }

    return false;
  };

  /**
   * Handle agent sessions
   */
  const handleAgentSessions = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const sessionsMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/sessions$/);

    if (!sessionsMatch) return false;

    const agentId = sessionsMatch[1];

    if (!agentIdPattern.test(agentId) || agentId.length > 64) {
      return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ error: "Invalid agent ID format" }));
    }

    if (request.method === "GET") {
      const sessions = registry.listSessions(agentId);
      return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ sessions }));
    }

    if (request.method === "POST") {
      try {
        const agent = registry.getAgent(agentId);
        if (!agent) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                      response.end(JSON.stringify({ error: "Agent not found" }));
        
        const body = await readRequestBody(request);
        
        // Validate session input
        if (body.title && (typeof body.title !== 'string' || body.title.length > 200)) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid session title" }));
        }
        
        if (body.model && (typeof body.model !== 'string' || body.model.length > 120)) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid session model" }));
        }
        
        const session = registry.createSession(agentId, body);
        if (!session) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                    response.end(JSON.stringify({ error: "Agent not found" }));
        return response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ session }));
      } catch (err) {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Invalid request body" }));
      }
    }

    return false;
  };

  /**
   * Handle session messages
   */
  const handleSessionMessages = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const sessionMsgMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/sessions\/([\w-]+)\/messages$/);

    if (!sessionMsgMatch) return false;

    const agentId = sessionMsgMatch[1];
    const sessionId = sessionMsgMatch[2];

    // Validate IDs format
    if (!agentIdPattern.test(agentId) || agentId.length > 64 || 
        !agentIdPattern.test(sessionId) || sessionId.length > 64) {
      return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ error: "Invalid ID format" }));
    }

    if (request.method === "GET") {
      const messagesResult = registry.listMessages(agentId, sessionId);
      const messages = messagesResult.messages || [];
      return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ messages }));
    }

    if (request.method === "POST") {
      try {
        const body = await readRequestBody(request);
        
        // Validate message input with enhanced security
        if (!body.role || !['user', 'assistant', 'system'].includes(body.role)) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid message role: must be user, assistant, or system" }));
        }
        
        // Validate and sanitize content with comprehensive checks
        if (!body.content || typeof body.content !== 'string') {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Message content is required and must be a string" }));
        }
        
        const originalContent = body.content;
        
        // Enhanced content validation
        if (originalContent.trim().length === 0) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Message content cannot be empty" }));
        }
        
        if (originalContent.length > 50000) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Message content too long (max 50000 characters)" }));
        }
        
        // Check for potential injection attacks
        const dangerousPatterns = [
          /<script[^>]*>/gi,
          /javascript:/gi,
          /data:/gi,
          /on\w+\s*=/gi,
          /<iframe[^>]*>/gi,
          /<object[^>]*>/gi,
          /<embed[^>]*>/gi,
          /<style[^>]*>/gi,
          /<meta[^>]*>/gi,
          /<link[^>]*>/gi
        ];
        
        for (const pattern of dangerousPatterns) {
          if (pattern.test(originalContent)) {
            return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                   response.end(JSON.stringify({ error: "Message contains invalid or potentially dangerous content" }));
          }
        }
        
        // Additional content security checks
        if (originalContent.includes('eval(') || 
            originalContent.includes('exec(') ||
            originalContent.includes('Function(') ||
            originalContent.includes('setTimeout') ||
            originalContent.includes('setInterval')) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Message contains potentially dangerous JavaScript" }));
        }
        
        // Validate token counts with bounds checking
        const tokensIn = body.tokensIn || 0;
        const tokensOut = body.tokensOut || 0;
        
        if (!Number.isInteger(tokensIn) || tokensIn < 0 || tokensIn > 1000000) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid tokensIn value: must be a positive integer less than 1, 000,000" }));
        }
        
        if (!Number.isInteger(tokensOut) || tokensOut < 0 || tokensOut > 1000000) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid tokensOut value: must be a positive integer less than 1, 000,000" }));
        }
        
        const message = registry.createMessage(agentId, sessionId, {
          role: body.role,
          content: originalContent,
          tokensIn,
          tokensOut,
          model: body.model || ''
        });
        if (!message) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                    response.end(JSON.stringify({ error: "Not found" }));
        return response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ message }));
      } catch (err) {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Invalid request body" }));
      }
    }

    return false;
  };

  /**
   * Handle agent creation
   */
  const handleCreateAgent = async (request, response) => {
    if (request.method !== "POST" || !request.url?.startsWith("/api/agents")) return false;
    
    // Only match exact /api/agents endpoint, not /api/agents/{id} or /api/agents/{id}/chat
    if (request.url !== "/api/agents" && !request.url?.startsWith("/api/agents?")) return false;
    
    // Authentication is handled by global middleware

    try {
      // Apply rate limiting for agent creation
      if (!applyRateLimit(request, response)) {
        return true; // Rate limit exceeded, response already sent
      }
      
      const body = await readRequestBody(request);
      console.log('DEBUG: Received request body:', body);
      
      // Handle both string and object responses from readRequestBody
      let parsedBody;
      if (body === null) {
        console.log('DEBUG: Empty request body');
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Empty request body" }));
      }
      if (typeof body === 'string') {
        try {
          // Enhanced security: Use safer JSON parsing with prototype protection
          parsedBody = JSON.parse(body, (key, value) => {
            // Filter out prototype pollution attempts
            if (key === '__proto__' || key === 'constructor' || key === 'prototype' ||
                key === '__defineGetter__' || key === '__defineSetter__' || 
                key === '__lookupGetter__' || key === '__lookupSetter__') {
              return undefined;
            }
            return value;
          });
          console.log('DEBUG: Parsed string body:', parsedBody);
        } catch (jsonErr) {
          console.log('DEBUG: JSON parse error:', jsonErr.message);
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid JSON format" }));
        }
      } else if (body !== null && typeof body === 'object') {
        // Enhanced security: Check for prototype pollution in object
        const suspiciousProps = ['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'];
        for (const prop of suspiciousProps) {
          if (Object.prototype.hasOwnProperty.call(body, prop)) {
            return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                   response.end(JSON.stringify({ error: "Invalid request body: contains suspicious properties" }));
          }
        }
        parsedBody = body;
        console.log('DEBUG: Received object body:', parsedBody);
      } else {
        console.log('DEBUG: Invalid request body format');
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Invalid request body" }));
      }
      
      if (!parsedBody || typeof parsedBody !== 'object') {
        console.log('DEBUG: Parsed body is not an object');
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Request body must be an object" }));
      }
      
      console.log('DEBUG: Body before validation:', parsedBody);
      
      // Apply Zod validation for agent creation
      try {
        console.log('DEBUG: Starting validation with schema:', createAgentSchema);
        const validatedBody = createAgentSchema.parse(parsedBody);
        parsedBody = validatedBody;
        console.log('DEBUG: Validation successful! Validated body:', validatedBody);
      } catch (validationError) {
        console.log('DEBUG: Validation failed:', validationError);
        if (validationError.errors && Array.isArray(validationError.errors)) {
          const errorDetails = validationError.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          }));
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ 
                   error: "Validation failed", 
                   details: errorDetails,
                   message: "The request contains invalid or missing data fields." 
                 }));
        } else {
          console.log('DEBUG: Validation error without errors array:', validationError);
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Validation failed", message: validationError.message || "Invalid input data" }));
        }
      }
      
      // Validate basic structure after Zod validation
      const requiredFields = ['name', 'model']; // Only these are required by Zod schema
      for (const field of requiredFields) {
        if (!(field in parsedBody)) {
          console.log('DEBUG: Missing field:', field);
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: `Missing required field: ${field}` }));
        }
      }
      
      // Additional security validation for POST agent creation
      const sqlKeywords = ['select', 'insert', 'update', 'delete', 'drop', 'create', 'alter', 'union', 'exec', 'execute', 'script', 'javascript', 'iframe'];
      const dangerousPatterns = [
        /;\s*--/,
        /'\s*or\s*1=1/i,
        /\b(and|or)\s*\d+=\d+/i,
        /\b(and|or)\s*'\s*=/i,
        /<script[^>]*>/i,
        /javascript:/i,
        /<iframe/i
      ];
      
      // Check name field for SQL injection
      if (parsedBody.name) {
        const lowerName = parsedBody.name.toLowerCase();
        for (const keyword of sqlKeywords) {
          if (lowerName.includes(keyword)) {
            console.log('DEBUG: SQL injection keyword in name:', keyword);
            return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                   response.end(JSON.stringify({ error: "Invalid agent name: contains potentially malicious content" }));
          }
        }
        
        for (const pattern of dangerousPatterns) {
          if (pattern.test(parsedBody.name)) {
            console.log('DEBUG: Dangerous pattern in name:', pattern);
            return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                   response.end(JSON.stringify({ error: "Invalid agent name: contains potentially malicious content" }));
          }
        }
      }
      
      // Check purpose field for SQL injection
      if (parsedBody.purpose) {
        const lowerPurpose = parsedBody.purpose.toLowerCase();
        for (const keyword of sqlKeywords) {
          if (lowerPurpose.includes(keyword)) {
            console.log('DEBUG: SQL injection keyword in purpose:', keyword);
            return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                   response.end(JSON.stringify({ error: "Invalid agent purpose: contains potentially malicious content" }));
          }
        }
        
        for (const pattern of dangerousPatterns) {
          if (pattern.test(parsedBody.purpose)) {
            console.log('DEBUG: Dangerous pattern in purpose:', pattern);
            return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                   response.end(JSON.stringify({ error: "Invalid agent purpose: contains potentially malicious content" }));
          }
        }
      }
      
      console.log('DEBUG: Calling parseCreateAgentInput with:', parsedBody);
      
      // Validate parsed body before calling parseCreateAgentInput
      if (!parsedBody || typeof parsedBody !== 'object') {
        console.log('DEBUG: Parsed body is not an object');
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Parsed body must be an object" }));
      }
      
      try {
        const payload = parseCreateAgentInput(parsedBody);
        console.log('DEBUG: Parsed payload:', payload);
        
        // Create agent using registry
        const agent = registry.createAgent(payload);
        console.log('DEBUG: Created agent:', agent);
        
        console.log('DEBUG: Calling sendJson with 201 and agent object');
        return response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ agent }));
      } catch (err) {
        // Comprehensive error message sanitization
        let errorMessage = "Invalid request data";
        
        // Log detailed error for debugging (sanitized)
        const safeErrorMessage = sanitizeError(err.message || "Unknown error");
        console.log('Agent creation error:', safeErrorMessage);
        
        // Provide specific but safe error messages
        if (err.message && err.message.includes('database')) {
          errorMessage = "Database operation failed";
        } else if (err.message && err.message.includes('reserved')) {
          errorMessage = "Invalid agent name: name not available";
        } else if (err.message && err.message.includes('validation')) {
          errorMessage = "Input validation failed";
        } else if (err.message && err.message.includes('security')) {
          errorMessage = "Security validation failed";
        }
        
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: errorMessage }));
      }
    } catch (err) {
      // Handle any unexpected errors in the main try block
      console.error('Unexpected error in agent creation:', err);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Internal server error" }));
    }
  };

  /**
   * Handle agent listing
   */
  const handleListAgents = async (request, response) => {
    if (request.method !== "GET" || !request.url?.startsWith("/api/agents")) return false;
    
    // Authentication is handled by global middleware

    try {
      const agents = registry.listAgents();
      
      // Limit response size to prevent DoS
      if (agents.length > 1000) {
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "http://localhost:4000"
        });
        response.end(JSON.stringify({ 
          agents: agents.slice(0, 1000),
          warning: "Response truncated to first 1000 agents"
        }));
        return true;
      }
      
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "http://localhost:4000"
      });
      response.end(JSON.stringify({ agents }));
      return true;
    } catch (err) {
      response.writeHead(500, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "http://localhost:4000"
      });
      response.end(JSON.stringify({ error: "Internal server error" }));
      return true;
    }
  };

  /**
   * Handle agent usage stats
   */
  const handleAgentUsage = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const usageMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/usage$/);

    if (!usageMatch) return false;
    
    // Authentication is handled by global middleware

    const agentId = usageMatch[1];
    const agent = registry.getAgent(agentId);
    if (!agent) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                  response.end(JSON.stringify({ error: "Agent not found" }));

    const usage = registry.getAgentUsage(agentId);
    return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
           response.end(JSON.stringify(usage));
  };

  /**
   * Handle agent history
   */
  const handleAgentHistory = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const historyMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/history$/);

    if (!historyMatch) return false;

    const agentId = historyMatch[1];
    const agent = registry.getAgent(agentId);
    if (!agent) return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
                  response.end(JSON.stringify({ error: "Agent not found" }));

    // Get recent sessions with their messages
    const sessions = registry.listSessions(agentId);
    const history = sessions.map(session => ({
      sessionId: session.id,
      title: session.title,
      model: session.model,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: (registry.listMessages(agentId, session.id).messages || []).length,
      recentMessages: (registry.listMessages(agentId, session.id).messages || []).slice(-5) // Last 5 messages
    })).slice(0, 10); // Limit to 10 most recent sessions

    // Get usage stats
    const usage = registry.getAgentUsage(agentId);

    return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
           response.end(JSON.stringify({
             agentId,
             agentName: agent.name,
             totalSessions: sessions.length,
             totalMessages: usage?.totalMessages || 0,
             totalTokensIn: usage?.totalTokensIn || 0,
             totalTokensOut: usage?.totalTokensOut || 0,
             recentHistory: history
           }));
  };

  /**
   * Handle agent tools listing
   */
  const handleAgentTools = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const toolsMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/tools$/);

    if (!toolsMatch) return false;

    const agentId = toolsMatch[1];
    
    // Validate agent ID format
    if (!agentIdPattern.test(agentId) || agentId.length > 64) {
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
    if (!agentIdPattern.test(agentId) || agentId.length > 64 || 
        !agentIdPattern.test(toolId) || toolId.length > 64) {
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
   * Register agent routes
   */
  server.on('request', async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    // Try each handler in order
    const handlers = [
      handleSingleAgent,
      handleAgentSessions,
      handleSessionMessages,
      handleCreateAgent,
      handleListAgents,
      handleAgentUsage,
      handleAgentHistory,
      handleAgentTools,
      handleAgentTool
    ];

    for (const handler of handlers) {
      try {
        const handled = await handler(request, response);
        if (handled !== false) return; // Handler processed the request
      } catch (error) {
        console.error('Agent route error:', error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }

    // If no handler matched, let the main server handle it
    return false;
  });
}