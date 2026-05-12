/**
 * Agent Routes - Handle all agent-related API endpoints
 */

export function registerAgentRoutes(server, registry, providers, failoverChains, settings) {
  // Agent ID validation pattern
  const agentIdPattern = /^[a-zA-Z0-9-]+$/;

  /**
   * Handle single agent operations
   */
  const handleSingleAgent = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const agentMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)$/);

    if (!agentMatch) return false;

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

    try {
      const body = await readRequestBody(request);
      console.log('DEBUG: Received request body:', body);
      
      // Handle both string and object responses from readRequestBody
      let parsedBody;
      if (typeof body === 'string') {
        try {
          parsedBody = JSON.parse(body);
          console.log('DEBUG: Parsed string body:', parsedBody);
        } catch (jsonErr) {
          console.log('DEBUG: JSON parse error:', jsonErr.message);
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid JSON format" }));
        }
      } else if (typeof body === 'object') {
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
      
      // Validate basic structure before calling parseCreateAgentInput
      const requiredFields = ['name', 'purpose', 'provider', 'model', 'isolationMode', 'maxConcurrentTasks', 'peerAccess'];
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
      const payload = parseCreateAgentInput(parsedBody);
      console.log('DEBUG: Parsed payload:', payload);
      
      console.log('DEBUG: Calling registry.createAgent with:', payload);
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
  };

  /**
   * Handle agent listing
   */
  const handleListAgents = async (request, response) => {
    if (request.method !== "GET" || !request.url?.startsWith("/api/agents")) return false;

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
      handleAgentHistory
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