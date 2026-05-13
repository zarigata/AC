/**
 * Chat Routes - Handle all chat-related API endpoints
 */

import { applyRateLimit } from "../middleware/security.js";
import { createProvider } from "../adapters/ollama.js";
import { readRequestBody } from "../middleware/requestHandler.js";
import { sessionManager } from "../database/sessionManager.js";
import TokenManager from "../token/tokenManager.js";

export function registerChatRoutes(server, registry, providers, failoverChains, settings) {
  // Initialize token manager for this chat instance
  const tokenManager = new TokenManager(registry);
  /**
   * Handle direct chat provider requests (no agent needed)
   * Skip session-related endpoints as they have their own handlers
   */
  const handleDirectChat = async (request, response) => {
    if (request.method !== "POST" || !request.url?.startsWith("/api/chat")) return false;
    
    // Skip session endpoints - they have their own handlers
    if (request.url?.startsWith("/api/chat/sessions")) return false;

    try {
      // Apply rate limiting for direct chat
      if (!applyRateLimit(request, response)) {
        return true; // Rate limit exceeded, response already sent
      }
      
      const body = await readRequestBody(request);
      
      // Session handling
      let sessionId = null;
      let session = null;
      
      // Check for session ID in header or body
      sessionId = request.headers['x-session-id'] || body.sessionId;
      
      if (sessionId) {
        try {
          session = await sessionManager.getSession(sessionId);
          if (!session) {
            response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: "Session not found" }));
            return true;
          }
        } catch (error) {
          console.error('Error loading session:', error);
          response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Failed to load session" }));
          return true;
        }
      } else {
        // Create new session
        const userId = request.headers['x-user-id'] || `user_${request.socket.remoteAddress}`;
        try {
          session = await sessionManager.createSession(userId, {
            title: body.title || 'New Chat',
            agentId: body.agentId || null,
            metadata: body.metadata || {}
          });
          sessionId = session.id;
        } catch (error) {
          console.error('Error creating session:', error);
          response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Failed to create session" }));
          return true;
        }
      }
      
      // Validate provider name with enhanced security
      if (!body.provider || typeof body.provider !== 'string' || body.provider.length > 80 || body.provider.length < 1) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Invalid provider name" }));
        return true;
      }
      
      // Sanitize provider name to prevent injection
      const providerName = body.provider.trim();
      const provider = createProvider(providerName);
      if (!provider) {
        // Don't expose all available providers for security reasons
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: `Provider '${providerName}' not configured` }));
        return true;
      }

      // Validate messages array with enhanced security
      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Message or messages array is required" }));
          return true;
        }
        // Convert single message to array format
        body.messages = [{ role: "user", content: body.message }];
      } else {
        // Validate each message in the array
        if (body.messages.length > 100) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Messages array cannot exceed 100 messages" }));
          return true;
        }
        
        for (let i = 0; i < body.messages.length; i++) {
          const msg = body.messages[i];
          if (!msg || typeof msg !== 'object') {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: `Message ${i} must be an object` }));
            return true;
          }
          
          if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: `Invalid role in message ${i}: ${msg.role}` }));
            return true;
          }
          
          if (!msg.content || typeof msg.content !== 'string' || msg.content.trim().length === 0) {
            response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: `Message ${i} content is required` }));
            return true;
          }
          
          // Enhanced security: Check for potentially dangerous content
          const dangerousPatterns = [
            /<script[^>]*>.*?<\/script>/gi,
            /javascript:/gi,
            /eval\(/gi,
            /exec\(/gi,
            /Function\(/gi,
            /on\w+\s*=/gi,
            /SELECT\s+/gi,
            /INSERT\s+/gi,
            /UPDATE\s+/gi,
            /DELETE\s+/gi,
            /DROP\s+/gi,
            /CREATE\s+/gi,
            /ALTER\s+/gi,
            /;\s*--/g
          ];
          
          for (const pattern of dangerousPatterns) {
            if (pattern.test(msg.content)) {
              response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              response.end(JSON.stringify({ error: `Message ${i} contains potentially dangerous content` }));
              return true;
            }
          }
        }
      }

      // Check if streaming is requested
      if (body.stream === true) {
        // Set up SSE headers
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });

        try {
          if (provider.health && provider.chatStream) {
            // For failover chains, they handle streaming themselves
            
            // Save user message to session first
            const userMessageData = {
              role: 'user',
              content: body.messages[body.messages.length - 1].content
            };
            await sessionManager.saveMessage(sessionId, userMessageData, {
              metadata: {
                provider: providerName,
                model: body.model,
                temperature: body.temperature,
                maxTokens: body.maxTokens
              }
            });
            
            let accumulatedContent = "";
            
            await provider.chatStream(body.messages, {
              model: body.model,
              temperature: body.temperature,
              maxTokens: body.maxTokens,
            }, async (chunk) => {
              accumulatedContent += chunk.content || "";
              
              // Send SSE event with failover metadata if present
              const eventData = JSON.stringify({
                ...chunk,
                provider: providerName,
                timestamp: Date.now()
              });
              response.write(`data: ${eventData}\n\n`);
            }, async (finalResult) => {
              // Save assistant response to session
              const assistantMessageData = {
                role: 'assistant',
                content: finalResult.content || accumulatedContent,
                tokensUsed: finalResult.tokensOut,
                responseTimeMs: finalResult.duration
              };
              await sessionManager.saveMessage(sessionId, assistantMessageData, {
                metadata: {
                  provider: providerName,
                  model: finalResult.model,
                  tokensIn: finalResult.tokensIn,
                  tokensOut: finalResult.tokensOut
                }
              });
              
              // Send final event with failover metadata if present
              const eventData = JSON.stringify({
                ...finalResult,
                provider: providerName,
                sessionId: sessionId,
                sessionTitle: session.title,
                timestamp: Date.now()
              });
              response.write(`data: ${eventData}\n\n`);
              response.end();
            });
          } else {
            // For regular providers, use the old method
            
            // Save user message to session first
            const userMessageData = {
              role: 'user',
              content: body.messages[body.messages.length - 1].content
            };
            await sessionManager.saveMessage(sessionId, userMessageData, {
              metadata: {
                provider: providerName,
                model: body.model,
                temperature: body.temperature,
                maxTokens: body.maxTokens
              }
            });
            
            let accumulatedContent = "";
            let accumulatedTokensIn = 0;
            let accumulatedTokensOut = 0;
            
            await provider.chatStream(body.messages, {
              model: body.model,
              temperature: body.temperature,
              maxTokens: body.maxTokens,
            }, async (chunk) => {
              accumulatedContent += chunk.content || "";
              accumulatedTokensIn += chunk.tokensIn || 0;
              accumulatedTokensOut += chunk.tokensOut || 0;
              
              // Send SSE event
              const eventData = JSON.stringify({
                content: chunk.content || "",
                accumulatedContent,
                tokensIn: chunk.tokensIn || 0,
                tokensOut: chunk.tokensOut || 0,
                duration: chunk.duration || 0,
                model: chunk.model || body.model || providerName,
                provider: providerName,
                done: chunk.done || false,
                sessionId: sessionId,
                sessionTitle: session.title
              });
              
              response.write(`data: ${eventData}\n\n`);
            }, async (finalResult) => {
              // Save assistant response to session
              const assistantMessageData = {
                role: 'assistant',
                content: finalResult.content || accumulatedContent,
                tokensUsed: finalResult.tokensOut,
                responseTimeMs: finalResult.duration
              };
              await sessionManager.saveMessage(sessionId, assistantMessageData, {
                metadata: {
                  provider: providerName,
                  model: finalResult.model,
                  tokensIn: finalResult.tokensIn,
                  tokensOut: finalResult.tokensOut
                }
              });
              
              // Send final event
              const eventData = JSON.stringify({
                content: finalResult.content || "",
                accumulatedContent: finalResult.content || "",
                tokensIn: finalResult.tokensIn || 0,
                tokensOut: finalResult.tokensOut || 0,
                duration: finalResult.duration || 0,
                model: finalResult.model || body.model || providerName,
                provider: providerName,
                done: true,
                final: true,
                sessionId: sessionId,
                sessionTitle: session.title
              });
              
              response.write(`data: ${eventData}\n\n`);
              response.end();
            });
          }
        } catch (e) {
          // Send error event
          const eventData = JSON.stringify({
            error: e.message,
            done: true,
            final: true
          });
          response.write(`data: ${eventData}\n\n`);
          response.end();
        }
        return true;
      }

      // Regular (non-streaming) request
      try {
        // Save user message to session
        const userMessageData = {
          role: 'user',
          content: body.messages[body.messages.length - 1].content
        };
        await sessionManager.saveMessage(sessionId, userMessageData, {
          metadata: {
            provider: providerName,
            model: body.model,
            temperature: body.temperature,
            maxTokens: body.maxTokens
          }
        });
        
        const result = await provider.chat(body.messages, {
          model: body.model,
          temperature: body.temperature,
          maxTokens: body.maxTokens,
        });
        
        // Save assistant response to session
        const assistantMessageData = {
          role: 'assistant',
          content: result.content,
          tokensUsed: result.tokensOut,
          responseTimeMs: result.duration
        };
        await sessionManager.saveMessage(sessionId, assistantMessageData, {
          metadata: {
            provider: providerName,
            model: result.model,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut
          }
        });
        
        // Include session ID in response for client to maintain context
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          content: result.content,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          duration: result.duration,
          model: result.model,
          provider: providerName,
          sessionId: sessionId,
          sessionTitle: session.title
        }));
        return true;
      } catch (e) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: e.message }));
        return true;
      }
    } catch (err) {
      console.error('Direct chat error:', err);
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid request body" }));
      return true;
    }
  };

  /**
   * Handle agent chat requests
   */
  const handleAgentChat = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const chatMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/chat$/);

    if (!chatMatch) return false;

    const agentId = chatMatch[1];
    
    // Apply rate limiting for agent chat
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    // Enhanced agent ID validation with comprehensive security checks
    if (!agentId || typeof agentId !== 'string' || agentId.length > 64 || agentId.length < 1) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid agent ID format" }));
      return true;
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
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Invalid agent ID: contains potentially malicious content" }));
        return true;
      }
    }
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(agentId)) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Invalid agent ID: contains potentially malicious content" }));
        return true;
      }
    }
    
    // Check for potentially dangerous agent IDs
    if (agentId.toLowerCase().includes('admin') || 
        agentId.toLowerCase().includes('system') || 
        agentId.toLowerCase().includes('root')) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid agent ID: reserved name" }));
      return true;
    }
    
    const agent = registry.getAgent(agentId);
    if (!agent) {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Agent not found" }));
      return true;
    }

    try {
      const body = await readRequestBody(request);
      
      // Validate user message with enhanced security
      let userMessage;
      if (body.message) {
        if (typeof body.message !== 'string' || body.message.trim().length === 0) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Message must be a non-empty string" }));
          return true;
        }
        userMessage = body.message.trim();
      } else if (body.content) {
        if (typeof body.content !== 'string' || body.content.trim().length === 0) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Content must be a non-empty string" }));
          return true;
        }
        userMessage = body.content.trim();
      } else {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Message or content is required" }));
        return true;
      }
      
      // Enhanced security: Check message length and content
      if (userMessage.length > 16000) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Message too long: maximum 16000 characters allowed" }));
        return true;
      }
      
      // Enhanced security: Check for potentially dangerous content
      const dangerousPatterns = [
        /<script[^>]*>.*?<\/script>/gi,
        /javascript:/gi,
        /eval\(/gi,
        /exec\(/gi,
        /Function\(/gi,
        /on\w+\s*=/gi,
        /SELECT\s+/gi,
        /INSERT\s+/gi,
        /UPDATE\s+/gi,
        /DELETE\s+/gi,
        /DROP\s+/gi,
        /CREATE\s+/gi,
        /ALTER\s+/gi,
        /;\s*--/g
      ];
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(userMessage)) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Message contains potentially dangerous content" }));
          return true;
        }
      }

      // Check if streaming is requested
      if (body.stream === true) {
        // Set up SSE headers first - this is crucial for streaming to work
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });

        // Create/get session first to avoid race conditions
        let session;
        let sessionCreationError = null;
        try {
          const sessions = registry.listSessions(agentId);
          session = sessions.length > 0 ? sessions[0] : registry.createSession(agentId, { title: "Chat" });
          
          // Save user message
          registry.createMessage(agentId, session.id, {
            role: "user",
            content: userMessage,
            tokensIn: 0
          });
        } catch (sessErr) {
          sessionCreationError = sessErr;
          console.error('Failed to create session:', sessErr.message);
          // Continue with streaming anyway, use fresh history
        }
        
        // Build message history (if session available, otherwise start fresh)
        const history = session ? 
          (registry.listMessages(agentId, session.id).messages || []).map((m) => ({
            role: m.role,
            content: m.content
          })) : 
          [];
        
        // Add system prompt if defined for this agent
        if (agent.systemPrompt && agent.systemPrompt.trim()) {
          history.unshift({
            role: "system",
            content: agent.systemPrompt.trim()
          });
        }
        
        // Add user message
        history.push({
          role: "user",
          content: userMessage
        });

        // Call provider (default to ollama, agent can override)
        const chatProvider = providers[agent.provider?.toLowerCase()] || providers.ollama;
        if (!chatProvider) {
          const eventData = JSON.stringify({
            error: `No provider configured for agent '${agent.name}' (tried '${agent.provider}')`,
            done: true,
            final: true
          });
          response.write(`data: ${eventData}\n\n`);
          response.end();
          return true;
        }
        
        // Handle session creation error by sending warning in first chunk
        if (sessionCreationError) {
          console.warn('Session creation failed, proceeding with streaming anyway:', sessionCreationError.message);
        }

        try {
          let accumulatedContent = "";
          let accumulatedTokensIn = 0;
          let accumulatedTokensOut = 0;
          
          await chatProvider.chatStream(history, { model: agent.model, temperature: body.temperature ?? 0.7, maxTokens: body.maxTokens ?? 512 }, (chunk) => {
            accumulatedContent += chunk.content || "";
            accumulatedTokensIn += chunk.tokensIn || 0;
            accumulatedTokensOut += chunk.tokensOut || 0;
            
            // Send SSE event
            const eventData = JSON.stringify({
              content: chunk.content || "",
              accumulatedContent,
              tokensIn: chunk.tokensIn || 0,
              tokensOut: chunk.tokensOut || 0,
              duration: chunk.duration || 0,
              model: chunk.model || agent.model,
              sessionId: session.id,
              done: chunk.done || false
            });
            
            response.write(`data: ${eventData}\n\n`);
          }, (finalResult) => {
            // Save assistant response asynchronously - don't break streaming if this fails
            if (session && session.id) {
              (async () => {
                try {
                  registry.createMessage(agentId, session.id, {
                    role: "assistant",
                    content: finalResult.content,
                    tokensIn: finalResult.tokensIn,
                    tokensOut: finalResult.tokensOut,
                    model: finalResult.model
                  });
                } catch (msgErr) {
                  console.error('Failed to save assistant message:', msgErr.message);
                  // Don't break streaming for this error
                }
              })();
            }
            
            // Send final event
            const eventData = JSON.stringify({
              content: finalResult.content || "",
              accumulatedContent: finalResult.content || "",
              tokensIn: finalResult.tokensIn || 0,
              tokensOut: finalResult.tokensOut || 0,
              duration: finalResult.duration || 0,
              model: finalResult.model || agent.model,
              sessionId: session ? session.id : 'unknown',
              done: true,
              final: true
            });
            
            response.write(`data: ${eventData}\n\n`);
            response.end();
          });
        } catch (e) {
          // Send error event
          const eventData = JSON.stringify({
            error: e.message,
            done: true,
            final: true
          });
          response.write(`data: ${eventData}\n\n`);
          response.end();
        }
        return true;
      }

      // Regular (non-streaming) request
      // Create or reuse session
      const sessions = registry.listSessions(agentId);
      let session = sessions.length > 0 ? sessions[0] : registry.createSession(agentId, { title: "Chat" });

      // Save user message
      registry.createMessage(agentId, session.id, {
        role: "user",
        content: userMessage,
        tokensIn: 0
      });

      // Build message history for provider
      const history = (registry.listMessages(agentId, session.id).messages || []).map((m) => ({
        role: m.role,
        content: m.content
      }));
      
      // Add system prompt if defined for this agent (at the beginning of the conversation)
      if (agent.systemPrompt && agent.systemPrompt.trim()) {
        history.unshift({
          role: "system",
          content: agent.systemPrompt.trim()
        });
      }

      // Call provider (default to ollama, agent can override)
      const chatProvider = createProvider(agent.provider?.toLowerCase()) || createProvider('ollama');
      if (!chatProvider) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: `No provider configured for agent '${agent.name}' (tried '${agent.provider}')` }));
        return true;
      }
      
      const result = await chatProvider.chat(history, { model: agent.model, temperature: body.temperature, maxTokens: body.maxTokens });
      
      // Add provider name to result for failover chains
      const responseResult = {
        message: result.content,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        duration: result.duration,
        model: result.model,
        sessionId: session.id
      };
      
      // Add failover-specific metadata if available
      if (result.failoverAttempts !== undefined) {
        responseResult.failoverAttempts = result.failoverAttempts;
      }
      
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(responseResult));

      // Save assistant response
      registry.createMessage(agentId, session.id, {
        role: "assistant",
        content: result.content,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        model: result.model
      });

      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        message: result.content,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        duration: result.duration,
        model: result.model,
        sessionId: session.id
      }));
      return true;
    } catch (err) {
      console.error('Agent chat error:', err);
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Invalid request body" }));
      return true;
    }
  };

  /**
   * Register chat routes
   */
  server.on('request', async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    // Try each handler in order
    const handlers = [
      handleDirectChat,
      handleAgentChat
    ];

    for (const handler of handlers) {
      try {
        const handled = await handler(request, response);
        if (handled !== false) return; // Handler processed the request
      } catch (error) {
        console.error('Chat route error:', error);
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }

    // If no handler matched, let the main server handle it
    return false;
  });

  // === Session Management Endpoints ===

  // GET /api/chat/sessions - List user's sessions
  server.on('request', async (req, res) => {
    if (req.method === "GET" && req.url?.startsWith("/api/chat/sessions")) {
      try {
        // Apply rate limiting
        if (!applyRateLimit(req, res)) {
          return true;
        }

        // Generate a user ID from the client IP for demonstration
        // In production, this would come from authentication
        const userId = req.headers['x-user-id'] || `user_${req.socket.remoteAddress}`;
        
        const sessions = await sessionManager.getUserSessions(userId, 20);
        
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: true, sessions }));
        return true;
      } catch (error) {
        console.error('Error getting sessions:', error);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Failed to get sessions" }));
        return true;
      }
    }
  });

  // GET /api/chat/sessions/:sessionId - Get specific session
  server.on('request', async (req, res) => {
    if (req.method === "GET" && req.url?.startsWith("/api/chat/sessions/")) {
      try {
        const sessionId = req.url.split('/').pop();
        
        // Apply rate limiting
        if (!applyRateLimit(req, res)) {
          return true;
        }
        
        const session = await sessionManager.getSession(sessionId);
        
        if (!session) {
          res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Session not found" }));
          return true;
        }
        
        // Get messages for this session
        const messages = await sessionManager.getMessages(sessionId);
        
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: true, session, messages }));
        return true;
      } catch (error) {
        console.error('Error getting session:', error);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Failed to get session" }));
        return true;
      }
    }
  });

  // POST /api/chat/sessions - Create new session
  server.on('request', async (req, res) => {
    if (req.method === "POST" && req.url?.startsWith("/api/chat/sessions")) {
      try {
        // Apply rate limiting
        if (!applyRateLimit(req, res)) {
          return true;
        }

        const body = await readRequestBody(req);
        const userId = req.headers['x-user-id'] || `user_${req.socket.remoteAddress}`;
        
        const session = await sessionManager.createSession(userId, {
          title: body.title || 'New Chat',
          agentId: body.agentId || null,
          metadata: body.metadata || {}
        });
        
        res.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: true, session }));
        return true;
      } catch (error) {
        console.error('Error creating session:', error);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Failed to create session" }));
        return true;
      }
    }
  });

  // DELETE /api/chat/sessions/:sessionId - Delete session
  server.on('request', async (req, res) => {
    if (req.method === "DELETE" && req.url?.startsWith("/api/chat/sessions/")) {
      try {
        const sessionId = req.url.split('/').pop();
        
        // Apply rate limiting
        if (!applyRateLimit(req, res)) {
          return true;
        }
        
        await sessionManager.deleteSession(sessionId);
        
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: true, message: 'Session deleted' }));
        return true;
      } catch (error) {
        console.error('Error deleting session:', error);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Failed to delete session" }));
        return true;
      }
    }
  });

  // PATCH /api/chat/sessions/:sessionId - Update session
  server.on('request', async (req, res) => {
    if (req.method === "PATCH" && req.url?.startsWith("/api/chat/sessions/")) {
      try {
        const sessionId = req.url.split('/').pop();
        
        // Apply rate limiting
        if (!applyRateLimit(req, res)) {
          return true;
        }
        
        const body = await readRequestBody(req);
        await sessionManager.updateSession(sessionId, body);
        
        const session = await sessionManager.getSession(sessionId);
        
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: true, session }));
        return true;
      } catch (error) {
        console.error('Error updating session:', error);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Failed to update session" }));
        return true;
      }
    }
  });
}