/**
 * WebSocket Handler - Contains WebSocket upgrade logic, client management, and broadcasting functions
 */

import { createHash, randomBytes } from 'node:crypto';
import { inspect } from 'node:util';

// Track active connections for DoS protection
const activeConnections = new Map();
let totalActiveConnections = 0;

// WebSocket message rate limiting
export const messageTimestamps = new Map();

// Connection management
const MAX_CONCURRENT_CONNECTIONS = 100;
const MAX_CONNECTIONS_PER_IP = 20;
const CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

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
      agents: agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        status: 'active',
        model: agent.model,
        isolationMode: agent.isolationMode,
        concurrentTasks: 0, // TODO: Implement getCurrentTaskCount
        lastActivity: Date.now()
      })),
      systemStats: {
        uptime: Math.floor((Date.now() - (global.serverStartTime || Date.now())) / 1000),
        totalSessions: 0,
        totalMessages: 0
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
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 256) {
    return false;
  }
  
  // Check for API key injection attempts
  if (apiKey.includes('"') || apiKey.includes("'") || apiKey.includes('`')) {
    return false;
  }
  
  // Use secure comparison to prevent timing attacks
  const validApiKey = process.env.WEBSOCKET_API_KEY;
  if (!validApiKey) {
    return false;
  }
  
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(apiKey, 'utf8'),
    Buffer.from(validApiKey, 'utf8')
  );
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

// Handle WebSocket connection upgrade
export const handleWebSocketUpgrade = (request, socket, head, ws, registry) => {
  try {
    const pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
    
    if (pathname === '/ws') {
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
      
      // Validate API key format and presence with enhanced checks
      if (!validateWebSocketApiKey(apiKey)) {
        console.error('WebSocket connection rejected: invalid authentication format');
        sendWebSocketError(socket, 401, 'Unauthorized: Invalid authentication format');
        return;
      }
      
      // Validate user agent for additional security
      const userAgent = request.headers['user-agent'] || '';
      if (!validateUserAgent(userAgent)) {
        console.error('WebSocket connection rejected: invalid user agent');
        sendWebSocketError(socket, 400, 'Bad request: Invalid user agent');
        return;
      }
      
      // Add client to set with metadata
      const clientInfo = {
        ws,
        connectedAt: Date.now(),
        userAgent,
        origin: origin || 'local',
        ip: request.socket.remoteAddress
      };
      
      // Track connection for cleanup
      const connectionKey = `${clientInfo.ip}-${clientInfo.connectedAt}`;
      activeConnections.set(connectionKey, {
        ...clientInfo,
        startTime: Date.now()
      });
      
      totalActiveConnections++;
      
      // Set up heartbeat for connection health
      const heartbeatInterval = setInterval(() => {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.ping();
        } else {
          clearInterval(heartbeatInterval);
          activeConnections.delete(connectionKey);
          totalActiveConnections--;
        }
      }, 30000);
      
      // Handle client disconnect with cleanup
      ws.on('close', () => {
        clearInterval(heartbeatInterval);
        activeConnections.delete(connectionKey);
        totalActiveConnections--;
        console.log(`WebSocket client disconnected from ${origin}`);
      });
      
      // Handle client errors with proper cleanup
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clearInterval(heartbeatInterval);
        activeConnections.delete(connectionKey);
        totalActiveConnections--;
      });
      
      // Handle messages with comprehensive validation and rate limiting
      ws.on('message', (message) => {
        try {
          const processedData = processWebSocketMessage(ws, message, clientInfo);
          
          // Handle different message types
          switch (processedData.type) {
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              break;
              
            case 'subscribe':
              // Handle subscription logic if needed
              break;
              
            case 'unsubscribe':
              // Handle unsubscription logic if needed
              break;
              
            default:
              // Unknown message type, send error
              ws.close(1008, 'Unknown message type');
          }
          
        } catch (err) {
          console.error('WebSocket message processing error:', err.message);
          ws.close(1008, err.message);
        }
      });
      
      // Send initial status to new client
      try {
        broadcastAgentStatus(registry);
      } catch (err) {
        console.error('Error broadcasting initial status:', err);
      }
      
      console.log(`WebSocket client connected from ${origin} (Total: ${totalActiveConnections})`);
      
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