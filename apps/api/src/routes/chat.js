/**
 * Chat Routes - Handle all chat-related API endpoints
 */

export function registerChatRoutes(server, registry, providers, failoverChains, settings) {
  /**
   * Handle direct chat provider requests (no agent needed)
   */
  const handleDirectChat = async (request, response) => {
    if (request.method !== "POST" || !request.url?.startsWith("/api/chat")) return false;

    try {
      const body = await readRequestBody(request);
      const providerName = body.provider || DEFAULT_PROVIDER;
      const provider = getProvider(providerName);
      if (!provider) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: `Provider '${providerName}' not configured. Available: ${Object.keys(providers).concat(Object.keys(failoverChains)).join(', ')}` }));
        return true;
      }

      const messages = body.messages || [{ role: "user", content: body.message || "" }];
      if (!messages.length || !messages[messages.length - 1]?.content?.trim()) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Message is required" }));
        return true;
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
            await provider.chatStream(messages, {
              model: body.model,
              temperature: body.temperature,
              maxTokens: body.maxTokens,
            }, (chunk) => {
              // Send SSE event with failover metadata if present
              const eventData = JSON.stringify({
                ...chunk,
                provider: providerName,
                timestamp: Date.now()
              });
              response.write(`data: ${eventData}\n\n`);
            }, (finalResult) => {
              // Send final event with failover metadata if present
              const eventData = JSON.stringify({
                ...finalResult,
                provider: providerName,
                timestamp: Date.now()
              });
              response.write(`data: ${eventData}\n\n`);
              response.end();
            });
          } else {
            // For regular providers, use the old method
            let accumulatedContent = "";
            let accumulatedTokensIn = 0;
            let accumulatedTokensOut = 0;
            
            await provider.chatStream(messages, {
              model: body.model,
              temperature: body.temperature,
              maxTokens: body.maxTokens,
            }, (chunk) => {
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
                done: chunk.done || false
              });
              
              response.write(`data: ${eventData}\n\n`);
            }, (finalResult) => {
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
                final: true
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
        const result = await provider.chat(messages, {
          model: body.model,
          temperature: body.temperature,
          maxTokens: body.maxTokens,
        });
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          content: result.content,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          duration: result.duration,
          model: result.model,
          provider: providerName,
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
    const agent = registry.getAgent(agentId);
    if (!agent) {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Agent not found" }));
      return true;
    }

    try {
      const body = await readRequestBody(request);
      const userMessage = body.message || body.content || "";
      if (!userMessage.trim()) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Message is required" }));
        return true;
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
          [{ role: "user", content: userMessage }];

        // Call provider (default to ollama, agent can override)
        const chatProvider = providers[agent.provider?.toLowerCase()] || providers[DEFAULT_PROVIDER];
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

      // Call provider (default to ollama, agent can override)
      const chatProvider = getProvider(agent.provider?.toLowerCase()) || getProvider(DEFAULT_PROVIDER);
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
}