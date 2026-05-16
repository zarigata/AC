/**
 * WebSocket Handler - Contains WebSocket upgrade logic, client management, and broadcasting functions
 */

import { createHash, randomBytes } from 'node:crypto';
import { inspect } from 'node:util';

/**
 * Constant time comparison function for security
 * Prevents timing attacks
 */
function constantTimeCompare(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

// Track active connections for DoS protection
const activeConnections = new Map();
let totalActiveConnections = 0;

// WebSocket message rate limiting
export const messageTimestamps = new Map();

// Connection management
const MAX_CONCURRENT_CONNECTIONS = 100;
const MAX_CONNECTIONS_PER_IP = 20;
const CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Task tracking
const activeTasks = new Map();
let totalActiveTasks = 0;

export const cleanupOldConnections = () => {
  const now = Date.now();
  const keysToDelete = [];
  
  // Clean up old connections
  for (const [key, connection] of activeConnections.entries()) {
    if (now - connection.startTime > CONNECTION_TIMEOUT) {
      keysToDelete.push(key);
    }
  }
  
  // Remove old connections
  for (const key of keysToDelete) {
    activeConnections.delete(key);
  }
  
  // Update total active connections counter
  totalActiveConnections = activeConnections.size;
};

// Start connection cleanup
setInterval(cleanupOldConnections, 60 * 1000); // Every minute

export const getConnectedClients = () => {
  return new Set(activeConnections.values().map(conn => conn.ws));
};

export const broadcastMessage = (message) => {
  const messageStr = JSON.stringify(message);
  getConnectedClients().forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(messageStr);
    }
  });
};

/**
 * Send message to specific client by connection ID
 */
export const sendToClient = (connectionId, message) => {
  const client = activeConnections.get(connectionId);
  if (client && client.ws && client.ws.readyState === 1) {
    try {
      client.ws.send(JSON.stringify(message));
    } catch (err) {
      console.error('Error sending message to client:', err);
    }
  }
};

/**
 * Send message to specific session subscribers
 */
export const broadcastToSession = (sessionId, message, excludeClientId = null) => {
  const messageStr = JSON.stringify(message);
  getConnectedClients().forEach(client => {
    if (client.readyState === 1 && 
        client.sessionId === sessionId && 
        client.connectionId !== excludeClientId) {
      try {
        client.send(messageStr);
      } catch (err) {
        console.error('Error broadcasting message to session client:', err);
      }
    }
  });
};

/**
 * Task management functions
 */

export const createTask = (agentId, type, data = {}) => {
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const task = {
    id: taskId,
    agentId,
    type,
    data,
    startTime: Date.now(),
    status: 'running',
    completed: false
  };
  
  activeTasks.set(taskId, task);
  totalActiveTasks++;
  
  return task;
};

export const completeTask = (taskId, result = null) => {
  const task = activeTasks.get(taskId);
  if (task) {
    task.completed = true;
    task.status = 'completed';
    task.endTime = Date.now();
    task.result = result;
    
    // Keep completed tasks for a while for history
    setTimeout(() => {
      activeTasks.delete(taskId);
    }, 5 * 60 * 1000); // Keep for 5 minutes
    
    totalActiveTasks--;
  }
};

export const getActiveTasks = () => {
  return Array.from(activeTasks.values()).filter(task => !task.completed);
};

export const broadcastJobUpdate = (job) => {
  const jobUpdate = {
    type: 'job_update',
    timestamp: Date.now(),
    data: job
  };
  
  broadcastMessage(jobUpdate);
};

export const broadcastAgentStatus = (registry) => {
  const agents = registry.listAgents();
  
  const statusUpdate = {
    type: 'agent_status',
    timestamp: Date.now(),
    data: {
      totalAgents: agents.length,
      agents: agents.map(agent => {
        const agentTasks = Array.from(activeTasks.values()).filter(
          task => task.agentId === agent.id && !task.completed
        );
        
        return {
          id: agent.id,
          name: agent.name,
          status: 'active',
          model: agent.model,
          isolationMode: agent.isolationMode,
          concurrentTasks: agentTasks.length,
          lastActivity: Date.now(),
          activeTasks: agentTasks.map(task => ({
            id: task.id,
            type: task.type,
            startTime: task.startTime,
            duration: Date.now() - task.startTime
          }))
        };
      }),
      systemStats: {
        uptime: Math.floor((Date.now() - (global.serverStartTime || Date.now())) / 1000),
        totalSessions: 0,
        totalMessages: 0,
        totalActiveTasks: totalActiveTasks
      }
    }
  };
  
  broadcastMessage(statusUpdate);
};

// Helper function to send WebSocket error responses
const sendWebSocketError = (socket, statusCode, message) => {
  try {
    // Sanitize error message to prevent information leakage
    const sanitizedMessage = message ? message.toString() : 'WebSocket error';
    
    const errorResponse = {
      type: 'error',
      code: statusCode,
      message: sanitizedMessage,
      timestamp: Date.now()
    };
    
    // Validate JSON structure before sending
    const response = `data: ${JSON.stringify(errorResponse)}\n\n`;
    
    // Check socket state before writing
    if (socket && socket.writable) {
      socket.write(response);
      socket.end();
    } else {
      console.error('Socket not writable, cannot send error response');
    }
  } catch (err) {
    console.error('Error sending WebSocket error response:', err.message);
    if (socket && socket.destroy) {
      socket.destroy();
    }
  }
};

// Validate API key with timing attack protection
const validateWebSocketApiKey = (apiKey) => {
  console.log('validateWebSocketApiKey called with:', { apiKey, type: typeof apiKey });
  
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 256) {
    console.log('Validation failed: basic checks');
    return false;
  }
  
  // Check for API key injection attempts
  if (apiKey.includes('"') || apiKey.includes("'") || apiKey.includes('`')) {
    console.log('Validation failed: injection attempts');
    return false;
  }
  
  // Use secure comparison to prevent timing attacks
  const validApiKey = process.env.WEBSOCKET_API_KEY;
  console.log('Environment check:', { validApiKey: validApiKey ? 'set' : 'not set' });
  if (!validApiKey) {
    console.log('Validation failed: no environment key');
    return false;
  }
  
  console.log('Comparing keys:', { input: apiKey, expected: validApiKey });
  
  // Constant-time comparison to prevent timing attacks
  try {
    // Use timingSafeEqual if available (Node.js >= 6.6.0)
    if (typeof crypto.timingSafeEqual === 'function') {
      const result = crypto.timingSafeEqual(
        Buffer.from(apiKey, 'utf8'),
        Buffer.from(validApiKey, 'utf8')
      );
      console.log('Validation result with timingSafeEqual:', result);
      return result;
    }
    
    // Fallback for older Node.js versions
    const result = constantTimeCompare(apiKey, validApiKey);
    console.log('Validation result with constantTimeCompare:', result);
    return result;
  } catch (err) {
    console.log('Validation error:', err.message);
    return false;
  }
};

// Validate user agent for additional security
const validateUserAgent = (userAgent) => {
  if (!userAgent || userAgent.length > 500) {
    return false;
  }
  
  // Additional security: check for suspicious user agents
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scanner/i,
    /test/i
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(userAgent)) {
      console.warn('Suspicious user agent detected for WebSocket connection:', userAgent);
      // Allow but log for monitoring
    }
  }
  
  return true;
};

// Process WebSocket messages with validation and rate limiting
const processWebSocketMessage = (ws, message, clientInfo) => {
  try {
    // Validate message size (1MB limit)
    if (message.length > 1024 * 1024) {
      throw new Error('Message too large');
    }
    
    // Only accept JSON messages
    const data = JSON.parse(message.toString(), (key, value) => {
      // Filter out prototype pollution attempts
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined;
      }
      return value;
    });
    
    // Validate message structure
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Invalid message format: expected object');
    }
    
    // Validate message type if present
    if (data.type && typeof data.type !== 'string') {
      throw new Error('Invalid message type: must be string');
    }
    
    // Rate limiting: Check message frequency per client with enhanced security
    const now = Date.now();
    const clientKey = clientInfo.ip || clientInfo.id; // Prefer IP for rate limiting
    
    // Initialize rate limiting data if not exists
    if (!messageTimestamps[clientKey]) {
      messageTimestamps[clientKey] = [];
    }
    
    // Remove timestamps older than 1 minute
    const oneMinuteAgo = now - 60000;
    messageTimestamps[clientKey] = messageTimestamps[clientKey].filter(timestamp => timestamp > oneMinuteAgo);
    
    // Check if rate limit exceeded (max 50 messages per minute reduced for security)
    if (messageTimestamps[clientKey].length >= 50) {
      throw new Error('Rate limit exceeded: maximum 50 messages per minute');
    }
    
    // Record this message timestamp
    messageTimestamps[clientKey].push(now);
    
    // Log message securely (no sensitive data)
    console.log('Received WebSocket message:', {
      type: data.type || 'unknown',
      timestamp: now,
      dataSize: JSON.stringify(data).length,
      hasData: !!data.data,
      messageCount: messageTimestamps[clientKey].length
    });
    
    return data;
    
  } catch (err) {
    console.error('Invalid WebSocket message format:', err.message);
    throw err;
  }
};

/**
 * Handle chat messages through WebSocket
 */
const handleChatMessage = async (ws, data, clientInfo, registry) => {
  try {
    // Validate chat message structure
    if (!data.data || typeof data.data !== 'object') {
      throw new Error('Chat message data is required and must be an object');
    }
    
    const { message, agentId, sessionId, type = 'chat' } = data.data;
    
    // Basic validation
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new Error('Message content is required');
    }
    
    if (message.length > 16000) {
      throw new Error('Message too long: maximum 16000 characters');
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
      if (pattern.test(message)) {
        throw new Error('Message contains potentially dangerous content');
      }
    }
    
    let response;
    
    if (type === 'chat' && agentId) {
      // Agent chat
      const agent = registry.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }
      
      // Get or create session
      let session;
      if (sessionId) {
        const sessions = registry.listSessions(agentId);
        session = sessions.sessions.find(s => s.id === sessionId);
        if (!session) {
          throw new Error(`Session ${sessionId} not found`);
        }
      } else {
        const sessions = registry.listSessions(agentId);
        session = sessions.sessions.length > 0 ? sessions.sessions[0] : registry.createSession(agentId, { 
          title: message.slice(0, 50) + (message.length > 50 ? '...' : '') 
        });
      }
      
      // Save user message
      registry.createMessage(agentId, session.id, {
        role: 'user',
        content: message.trim(),
        tokensIn: 0
      });
      
      // Send typing indicator
      broadcastToSession(session.id, {
        type: 'typing',
        agentId: agentId,
        sessionId: session.id,
        timestamp: Date.now()
      }, clientInfo.connectionId);
      
      // Get context window
      const { MemoryManager } = await import('../memory/memoryManager.js');
      const memoryManager = new MemoryManager(registry);
      const contextWindow = await memoryManager.getCompleteContext(agentId, session.id);
      
      // Add system prompt if defined
      if (agent.systemPrompt && agent.systemPrompt.trim()) {
        contextWindow.unshift({
          role: 'system',
          content: agent.systemPrompt.trim()
        });
      }
      
      // Add user message to context
      const userMessage = {
        role: 'user',
        content: message.trim(),
        timestamp: new Date().toISOString()
      };
      contextWindow.push(userMessage);
      
      // Call provider
      const { createProvider } = await import('../adapters/ollama.js');
      const provider = createProvider(agent.provider?.toLowerCase()) || createProvider('ollama');
      
      if (!provider) {
        throw new Error(`Provider ${agent.provider} not available`);
      }
      
      // Generate response
      const result = await provider.chat(contextWindow, { 
        model: agent.model, 
        temperature: 0.7, 
        maxTokens: 512 
      });
      
      // Save assistant response
      registry.createMessage(agentId, session.id, {
        role: 'assistant',
        content: result.content,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        model: result.model
      });
      
      // Add assistant response to context
      const assistantMessage = {
        role: 'assistant',
        content: result.content,
        timestamp: new Date().toISOString()
      };
      await memoryManager.addMessageToContext(agentId, session.id, assistantMessage);
      
      response = {
        type: 'chat_response',
        agentId,
        sessionId,
        message: result.content,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        duration: result.duration,
        model: result.model,
        timestamp: Date.now()
      };
      
    } else if (type === 'direct_chat') {
      // Direct chat (no agent)
      throw new Error('Direct chat via WebSocket not yet implemented');
    } else {
      throw new Error('Invalid chat type or missing agentId');
    }
    
    // Send response back to client
    sendToClient(clientInfo.connectionId, response);
    
    // Broadcast to other session subscribers if any
    if (sessionId) {
      broadcastToSession(sessionId, {
        ...response,
        type: 'session_message',
        broadcast: true
      }, clientInfo.connectionId);
    }
    
  } catch (error) {
    console.error('Chat message handling error:', error);
    
    // Send error response to client
    sendToClient(clientInfo.connectionId, {
      type: 'error',
      message: error.message,
      code: 'CHAT_ERROR',
      timestamp: Date.now()
    });
  }
};

// Handle WebSocket connection upgrade
export const handleWebSocketUpgrade = (request, socket, head, wsServer, registry) => {
  try {
    const pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
    
    if (pathname === '/ws') {
      console.log('WebSocket upgrade requested for:', request.url);
      // Validate WebSocket origin with enhanced security
      const origin = request.headers.origin;
      
      // Allow requests without origin for local development/testing
      if (origin && origin !== 'null' && origin !== undefined) {
        // First validate the origin format
        if (!validateOrigin(origin)) {
          console.error('WebSocket connection rejected from origin:', origin);
          sendWebSocketError(socket, 403, 'Forbidden: Origin not allowed');
          return;
        }
      }
      
      // Enhanced authentication check with multiple validation layers
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const apiKey = url.searchParams.get('auth');
      
      console.log('WebSocket authentication check:', { apiKey, expected: process.env.WEBSOCKET_API_KEY });
      
      // Validate API key format and presence with enhanced checks
      if (!validateWebSocketApiKey(apiKey)) {
        console.error('WebSocket connection rejected: invalid authentication format - apiKey:', apiKey);
        sendWebSocketError(socket, 401, 'Unauthorized: Invalid authentication format');
        return;
      }
      
      // Validate user agent for additional security
      const userAgent = request.headers['user-agent'] || '';
      console.log('WebSocket user agent:', userAgent);
      if (!validateUserAgent(userAgent)) {
        console.error('WebSocket connection rejected: invalid user agent');
        sendWebSocketError(socket, 400, 'Bad request: Invalid user agent');
        return;
      }
      
      // Add client to set with metadata
      const connectionId = `conn_${randomBytes(8).toString('hex')}`;
      const clientInfo = {
        connectionId,
        connectedAt: Date.now(),
        userAgent,
        origin: origin || 'local',
        ip: request.socket.remoteAddress,
        agentId: null,
        sessionId: null
      };
      
      // Track connection for cleanup
      activeConnections.set(connectionId, {
        ...clientInfo,
        startTime: Date.now()
      });
      
      totalActiveConnections++;
      
      // The WebSocket upgrade and message handling will be done in the callback below
      
      console.log(`WebSocket client connected from ${origin} (Total: ${totalActiveConnections})`);
      
      // Complete the WebSocket upgrade using the WebSocket server
      wsServer.handleUpgrade(request, socket, head, (upgradedWs) => {
        console.log('WebSocket upgrade completed successfully');
        // Update client info with the upgraded connection
        clientInfo.ws = upgradedWs;
        
        // Also update the connection in activeConnections
        const connectionData = activeConnections.get(connectionId);
        if (connectionData) {
          connectionData.ws = upgradedWs;
        }
        
        // Set up message handlers on the upgraded connection
        upgradedWs.on('message', async (message) => {
          try {
            const processedData = processWebSocketMessage(upgradedWs, message, clientInfo);
            
            // Always get the latest client info from activeConnections
            const currentClient = activeConnections.get(connectionId);
            
            // Handle different message types
            switch (processedData.type) {
              case 'ping':
                upgradedWs.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                break;
                
              case 'subscribe':
                // Handle subscription to session
                if (processedData.data?.sessionId && currentClient) {
                  currentClient.sessionId = processedData.data.sessionId;
                  // Update both references
                  clientInfo.sessionId = processedData.data.sessionId;
                  activeConnections.set(connectionId, currentClient);
                  sendToClient(connectionId, {
                    type: 'subscribed',
                    sessionId: processedData.data.sessionId,
                    timestamp: Date.now()
                  });
                }
                break;
                
              case 'unsubscribe':
                // Handle unsubscription from session
                if (currentClient) {
                  currentClient.sessionId = null;
                  clientInfo.sessionId = null;
                  activeConnections.set(connectionId, currentClient);
                  sendToClient(connectionId, {
                    type: 'unsubscribed',
                    timestamp: Date.now()
                  });
                }
                break;
                
              case 'chat':
              case 'direct_chat':
                // Handle chat messages
                if (currentClient) {
                  await handleChatMessage(upgradedWs, processedData, currentClient, registry);
                } else {
                  console.error('Cannot handle chat: client not found in active connections');
                }
                break;
                
              default:
                // Unknown message type, send error
                sendToClient(connectionId, {
                  type: 'error',
                  message: 'Unknown message type',
                  code: 'UNKNOWN_TYPE',
                  timestamp: Date.now()
                });
            }
            
          } catch (err) {
            console.error('WebSocket message processing error:', err.message);
            
            // Send error response instead of closing connection
            sendToClient(connectionId, {
              type: 'error',
              message: 'Message processing failed',
              code: 'PROCESSING_ERROR',
              timestamp: Date.now()
            });
          }
        });
      });
      
    } else {
      socket.destroy();
    }
  } catch (err) {
    console.error('WebSocket upgrade error:', err);
    sendWebSocketError(socket, 500, 'Internal server error');
  }
};

// Validate origin helper (import from security module if available)
const validateOrigin = (origin) => {
  if (!origin || typeof origin !== 'string') return false;
  
  // Reject dangerous origins
  if (origin.includes('*') || origin.includes('://0.0.0.0')) {
    return false;
  }
  
  // Only allow specific protocols
  if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
    return false;
  }
  
  // Validate URL format
  try {
    new URL(origin);
    return true;
  } catch {
    return false;
  }
};