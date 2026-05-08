import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { setInterval } from "node:timers";
import { WebSocketServer } from "ws";
import { createHash, createHmac } from "node:crypto";
import { inspect } from "node:util";

import {
  getProviderReadinessSummary,
  listProviderConnections,
  listProviders,
  parseCreateAgentInput,
  parseCreateLinkInput
} from "../../../packages/shared/src/index.js";

import { OllamaAdapter, createProvider } from "./adapters/ollama.js";
import { AgentRegistry } from "./registry.js";

// Multi-provider setup — primary is Ollama (local), fallbacks configured via env
const providers = {};
const providerNames = ["ollama", "openai", "anthropic", "gemini", "openrouter", "groq", "together", "lmstudio"];
const DEFAULT_PROVIDER = process.env.DEFAULT_PROVIDER || "ollama";

// Initialize Ollama as primary
providers.ollama = new OllamaAdapter({
  baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  model: process.env.OLLAMA_MODEL || "qwen3:1.7b",
  timeout: parseInt(process.env.OLLAMA_TIMEOUT || "120000", 10),
});

// Lazy-init other providers (only when API key is set)
for (const name of providerNames.slice(1)) {
  const envKey = name.toUpperCase() + "_API_KEY";
  if (process.env[envKey]) {
    try {
      providers[name] = createProvider(name);
    } catch (e) {
      console.warn(`Failed to init provider ${name}: ${e.message}`);
    }
  }
}

// Keep 'ollama' reference for backward compatibility
const ollama = providers.ollama;
const VERSION = "0.2.0";
const startTime = Date.now();

// Rate limiting: max 60 requests per minute per IP
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 60;
const MAX_CONCURRENT_CONNECTIONS = 100; // Maximum concurrent connections per IP
const CONN_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Security: Secret for HMAC-based rate limiting
const RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || crypto.randomBytes(32).toString('hex');

// Enhanced rate limiting with better security
const createRateLimitKey = (clientIP, timestamp) => {
  // Hash the IP for better privacy and security
  const ipHash = crypto.createHash('sha256').update(clientIP).digest('hex').substring(0, 16);
  const windowStart = Math.floor(timestamp / RATE_LIMIT_WINDOW) * RATE_LIMIT_WINDOW;
  return `${ipHash}:${windowStart}`;
};

// WebSocket server for real-time updates
const wss = new WebSocketServer({ noServer: true });
const connectedClients = new Set();

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const databasePath = process.env.ZSIISTANT_DB_PATH ?? new URL("../data/zsiistant.sqlite", import.meta.url).pathname;
const webRoot = fileURLToPath(new URL("../../web/", import.meta.url));

const registry = new AgentRegistry({ databasePath });
registry.seed();

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:4000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4000"
];

const isOriginAllowed = (origin) => {
  if (!origin) return false; // Block requests without origin for API endpoints
  return ALLOWED_ORIGINS.includes(origin);
};

// Sanitize JSON payload to prevent injection
const sanitizeJsonPayload = (payload) => {
  try {
    const jsonString = JSON.stringify(payload);
    // Remove potentially dangerous characters that could break JSON parsing
    return jsonString.replace(/\u0000/g, '').replace(/\r\n/g, '\n');
  } catch (err) {
    throw new Error('Failed to sanitize payload');
  }
};

const sendJson = (response, statusCode, payload) => {
  const origin = response.getHeader('origin');
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };
  
  if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else if (request.url?.startsWith('/api/')) {
    // Block unauthorized origins for API endpoints
    response.writeHead(403, {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(JSON.stringify({ error: 'Forbidden: Origin not allowed' }));
    return;
  }
  
  try {
    const sanitizedPayload = sanitizeJsonPayload(payload);
    response.writeHead(statusCode, headers);
    response.end(sanitizedPayload);
  } catch (err) {
    console.error('Failed to send JSON response:', err);
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: 'Internal server error' }));
  }
};

const MAX_JSON_PAYLOAD_SIZE = 1024 * 1024; // 1MB limit
const MAX_REQUEST_TIMEOUT = 30000; // 30 seconds timeout for requests

const readRequestBody = async (request) => {
  try {
    let raw = "";
    let totalLength = 0;
    
    // Add request timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), MAX_REQUEST_TIMEOUT);
    });
    
    const readPromise = (async () => {
      for await (const chunk of request) {
        // Validate chunk size and content
        if (chunk && typeof chunk === 'string') {
          totalLength += Buffer.byteLength(chunk, 'utf8');
          if (totalLength > MAX_JSON_PAYLOAD_SIZE) {
            throw new Error(`Payload too large (max ${MAX_JSON_PAYLOAD_SIZE / 1024 / 1024}MB)`);
          }
          raw += chunk;
        }
      }
    })();
    
    await Promise.race([readPromise, timeoutPromise]);

    if (!raw || raw.trim().length === 0) return {};
    
    try {
      const parsed = JSON.parse(raw);
      
      // Validate parsed object structure
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON structure');
      }
      
      // Prevent prototype pollution
      if (parsed.__proto__ !== Object.prototype && parsed.__proto__ !== null) {
        throw new Error('Invalid JSON structure');
      }
      
      return parsed;
    } catch (err) {
      throw new Error('Invalid JSON format');
    }
  } catch (err) {
    console.error('Request body read error:', err);
    throw err;
  }
};

const contentTypeFor = (path) => {
  const extension = extname(path);
  switch (extension) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    default:
      return "text/html; charset=utf-8";
  }
};

const providerSummary = () => {
  const staticProviders = listProviders();
  return {
    providers: staticProviders,
    configured: Object.keys(providers),
    default: DEFAULT_PROVIDER,
    summary: {
      total: staticProviders.length,
      local: staticProviders.filter((p) => p.category === "local").length,
      cloud: staticProviders.filter((p) => p.category === "cloud").length,
      selfHosted: staticProviders.filter((p) => p.category === "self-hosted").length,
      routers: staticProviders.filter((p) => p.category === "router").length
    },
    readiness: getProviderReadinessSummary(process.env)
  };
};

const server = createServer(async (request, response) => {
  const requestStartTime = Date.now();
  
  // Apply rate limiting
  if (!applyRateLimit(request, response)) {
    return; // Response already sent for rate limit exceeded
  }
  
  // Validate origin for API endpoints
  if (request.url?.startsWith('/api/') && request.method !== 'OPTIONS') {
    const origin = request.headers.origin;
    if (!isOriginAllowed(origin)) {
      sendJson(response, 403, { error: 'Forbidden: Origin not allowed' });
      return;
    }
  }
  
  const originalEnd = response.end;
  response.end = function(chunk, encoding) {
    const duration = Date.now() - requestStartTime;
    const status = response.statusCode || 200;
    
    registry.logRequest(
      request.method,
      request.url,
      status,
      duration,
      request.headers['user-agent'],
      request.headers['x-forwarded-for'] || request.socket.remoteAddress
    );
    
    return originalEnd.call(this, chunk, encoding);
  };
  
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS' && request.url?.startsWith('/api/')) {
    const origin = request.headers.origin;
    const headers = {
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With"
    };
    
    if (origin && isOriginAllowed(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Credentials"] = "true";
    }
    
    response.writeHead(200, headers);
    response.end();
    return;
  }
  
  try {
    // Validate request method and path
    if (!request.method || !request.url) {
      sendJson(response, 400, { error: 'Bad request: missing method or URL' });
      return;
    }

    // Validate URL format
    let url;
    try {
      url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    } catch (err) {
      sendJson(response, 400, { error: 'Invalid URL format' });
      return;
    }

    // Path validation for security
    const normalizedPath = url.pathname.replace(/\/+/g, '/');
    if (normalizedPath.includes('..') || normalizedPath.includes('~') || normalizedPath.includes('//')) {
      sendJson(response, 403, { error: 'Forbidden: Invalid path characters' });
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, {
        ok: true,
        service: "zsiistant-api",
        version: VERSION,
        uptime: Math.floor((Date.now() - startTime) / 1000)
      });
    }

    /* ─── Single Agent ─── */

    const agentMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)$/);

    // Agent ID validation
    const agentIdPattern = /^[a-zA-Z0-9-]+$/;
    if (agentMatch) {
      const agentId = agentMatch[1];
      
      // Validate agent ID format
      if (!agentIdPattern.test(agentId) || agentId.length > 64) {
        return sendJson(response, 400, { error: "Invalid agent ID format" });
      }

      if (request.method === "GET") {
        const agent = registry.getAgent(agentId);
        if (!agent) return sendJson(response, 404, { error: "Agent not found" });
        return sendJson(response, 200, { agent });
      }

      if (request.method === "PATCH") {
        try {
          const body = await readRequestBody(request);
          
          // Validate update input
          if (body.name && (typeof body.name !== 'string' || body.name.length > 80)) {
            return sendJson(response, 400, { error: "Invalid agent name" });
          }
          
          if (body.purpose && (typeof body.purpose !== 'string' || body.purpose.length > 240)) {
            return sendJson(response, 400, { error: "Invalid agent purpose" });
          }
          
          if (body.maxConcurrentTasks && (!Number.isInteger(body.maxConcurrentTasks) || body.maxConcurrentTasks < 1 || body.maxConcurrentTasks > 32)) {
            return sendJson(response, 400, { error: "Invalid maxConcurrentTasks" });
          }
          
          const agent = registry.updateAgent(agentId, body);
          if (!agent) return sendJson(response, 404, { error: "Agent not found" });
          return sendJson(response, 200, { agent });
        } catch (err) {
          return sendJson(response, 400, { error: "Invalid request body" });
        }
      }

      if (request.method === "DELETE") {
        const deleted = registry.deleteAgent(agentId);
        if (!deleted) return sendJson(response, 404, { error: "Agent not found" });
        return sendJson(response, 200, { deleted: true });
      }
    }

    /* ─── Sessions ─── */

    const sessionsMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/sessions$/);

    if (sessionsMatch && request.method === "GET") {
      const sessions = registry.listSessions(sessionsMatch[1]);
      return sendJson(response, 200, { sessions });
    }

    if (sessionsMatch && request.method === "POST") {
      try {
        const agentId = sessionsMatch[1];
        
        // Validate agent ID format
        if (!agentIdPattern.test(agentId) || agentId.length > 64) {
          return sendJson(response, 400, { error: "Invalid agent ID format" });
        }
        
        const agent = registry.getAgent(agentId);
        if (!agent) return sendJson(response, 404, { error: "Agent not found" });
        
        const body = await readRequestBody(request);
        
        // Validate session input
        if (body.title && (typeof body.title !== 'string' || body.title.length > 200)) {
          return sendJson(response, 400, { error: "Invalid session title" });
        }
        
        if (body.model && (typeof body.model !== 'string' || body.model.length > 120)) {
          return sendJson(response, 400, { error: "Invalid session model" });
        }
        
        const session = registry.createSession(agentId, body);
        if (!session) return sendJson(response, 404, { error: "Agent not found" });
        return sendJson(response, 201, { session });
      } catch (err) {
        return sendJson(response, 400, { error: "Invalid request body" });
      }
    }

    const sessionMsgMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/sessions\/([\w-]+)\/messages$/);

    if (sessionMsgMatch) {
      try {
        const agentId = sessionMsgMatch[1];
        const sessionId = sessionMsgMatch[2];
        
        // Validate IDs format
        if (!agentIdPattern.test(agentId) || agentId.length > 64 || 
            !agentIdPattern.test(sessionId) || sessionId.length > 64) {
          return sendJson(response, 400, { error: "Invalid ID format" });
        }
        
        if (request.method === "GET") {
          const messages = registry.listMessages(agentId, sessionId);
          return sendJson(response, 200, { messages });
        }

        if (request.method === "POST") {
          const body = await readRequestBody(request);
          
          // Validate message input
          if (!body.role || !['user', 'assistant', 'system'].includes(body.role)) {
            return sendJson(response, 400, { error: "Invalid message role" });
          }
          
          if (!body.content || typeof body.content !== 'string' || body.content.length === 0) {
            return sendJson(response, 400, { error: "Message content is required" });
          }
          
          if (body.content.length > 50000) {
            return sendJson(response, 400, { error: "Message content too long (max 50000 characters)" });
          }
          
          if (body.tokensIn && (!Number.isInteger(body.tokensIn) || body.tokensIn < 0)) {
            return sendJson(response, 400, { error: "Invalid tokensIn value" });
          }
          
          if (body.tokensOut && (!Number.isInteger(body.tokensOut) || body.tokensOut < 0)) {
            return sendJson(response, 400, { error: "Invalid tokensOut value" });
          }
          
          const message = registry.createMessage(agentId, sessionId, body);
          if (!message) return sendJson(response, 404, { error: "Not found" });
          return sendJson(response, 201, { message });
        }
      } catch (err) {
        return sendJson(response, 400, { error: "Invalid request body" });
      }
    }

    /* ─── Links ─── */

    if (request.method === "DELETE" && url.pathname === "/api/links") {
      try {
        const body = await readRequestBody(request);
        
        // Validate link deletion input
        if (!body.sourceAgentId || !body.targetAgentId) {
          return sendJson(response, 400, { error: "sourceAgentId and targetAgentId are required" });
        }
        
        if (!agentIdPattern.test(body.sourceAgentId) || body.sourceAgentId.length > 64 ||
            !agentIdPattern.test(body.targetAgentId) || body.targetAgentId.length > 64) {
          return sendJson(response, 400, { error: "Invalid agent ID format" });
        }
        
        if (body.sourceAgentId === body.targetAgentId) {
          return sendJson(response, 400, { error: "An agent cannot create a link to itself" });
        }
        
        const deleted = registry.deleteLink(body);
        if (!deleted) return sendJson(response, 404, { error: "Link not found" });
        return sendJson(response, 200, { deleted: true });
      } catch (err) {
        return sendJson(response, 400, { error: "Invalid request body" });
      }
    }

    /* ─── Settings ─── */

    if (request.method === "GET" && url.pathname === "/api/settings") {
      return sendJson(response, 200, {
        version: VERSION,
        defaultModel: "qwen3",
        maxAgents: 100,
        supportedIsolationModes: ["isolated", "selective", "mesh"],
        supportedLinkModes: ["observe", "message", "delegate"],
        providers: listProviders().length
      });
    }

    /* ─── Usage Stats ─── */

    const usageMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/usage$/);

    if (usageMatch && request.method === "GET") {
      const usage = registry.getAgentUsage(usageMatch[1]);
      if (!usage) return sendJson(response, 404, { error: "Agent not found" });
      return sendJson(response, 200, usage);
    }

    /* ─── Global Usage Stats ─── */

    if (request.method === "GET" && url.pathname === "/api/usage") {
      try {
        const period = new URLSearchParams(url.search).get('period') || 'daily';
        
        // Validate period parameter
        const validPeriods = ['daily', 'weekly', 'monthly', 'all'];
        if (!validPeriods.includes(period)) {
          return sendJson(response, 400, { error: "Invalid period parameter. Must be: daily, weekly, monthly, or all" });
        }
        
        const usage = registry.getUsageStats(period);
        return sendJson(response, 200, usage);
      } catch (err) {
        return sendJson(response, 500, { error: "Internal server error" });
      }
    }

    /* ─── Agent History ─── */

    const historyMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/history$/);

    if (historyMatch && request.method === "GET") {
      const agentId = historyMatch[1];
      const agent = registry.getAgent(agentId);
      if (!agent) return sendJson(response, 404, { error: "Agent not found" });

      // Get recent sessions with their messages
      const sessions = registry.listSessions(agentId);
      const history = sessions.map(session => ({
        sessionId: session.id,
        title: session.title,
        model: session.model,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: registry.listMessages(agentId, session.id).length,
        recentMessages: registry.listMessages(agentId, session.id).slice(-5) // Last 5 messages
      })).slice(0, 10); // Limit to 10 most recent sessions

      // Get usage stats
      const usage = registry.getAgentUsage(agentId);

      return sendJson(response, 200, {
        agentId,
        agentName: agent.name,
        totalSessions: sessions.length,
        totalMessages: usage?.totalMessages || 0,
        totalTokensIn: usage?.totalTokensIn || 0,
        totalTokensOut: usage?.totalTokensOut || 0,
        recentHistory: history
      });
    }

    /* ─── Request Logs ─── */

    if (request.method === "GET" && url.pathname === "/api/logs") {
      const logs = registry.getRecentLogs(100);
      return sendJson(response, 200, { logs });
    }

    /* ─── Provider Health (all configured) ─── */

    if (request.method === "GET" && url.pathname === "/api/providers/health") {
      const results = {};
      for (const [name, provider] of Object.entries(providers)) {
        try {
          results[name] = await provider.health();
        } catch (e) {
          results[name] = { ok: false, error: e.message };
        }
      }
      return sendJson(response, 200, results);
    }

    /* ─── Provider Chat (direct, no agent needed) ─── */

    if (request.method === "POST" && url.pathname === "/api/chat") {
      const body = await readRequestBody(request);
      const providerName = body.provider || DEFAULT_PROVIDER;
      const provider = providers[providerName];
      if (!provider) return sendJson(response, 400, { error: `Provider '${providerName}' not configured. Available: ${Object.keys(providers).join(", ")}` });

      const messages = body.messages || [{ role: "user", content: body.message || "" }];
      if (!messages.length || !messages[messages.length - 1]?.content?.trim()) {
        return sendJson(response, 400, { error: "Message is required" });
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
        return;
      }

      // Regular (non-streaming) request
      try {
        const result = await provider.chat(messages, {
          model: body.model,
          temperature: body.temperature,
          maxTokens: body.maxTokens,
        });
        return sendJson(response, 200, {
          content: result.content,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          duration: result.duration,
          model: result.model,
          provider: providerName,
        });
      } catch (e) {
        return sendJson(response, 502, { error: e.message });
      }
    }

    /* ─── Agent Chat (via configured provider) ─── */

    const chatMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/chat$/);

    if (chatMatch && request.method === "POST") {
      const agentId = chatMatch[1];
      const agent = registry.getAgent(agentId);
      if (!agent) return sendJson(response, 404, { error: "Agent not found" });

      const body = await readRequestBody(request);
      const userMessage = body.message || body.content || "";
      if (!userMessage.trim()) return sendJson(response, 400, { error: "Message is required" });

      // Check if streaming is requested
      if (body.stream === true) {
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
        const history = registry.listMessages(agentId, session.id).map((m) => ({
          role: m.role,
          content: m.content
        }));

        // Set up SSE headers
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        });

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
          return;
        }

        try {
          let accumulatedContent = "";
          let accumulatedTokensIn = 0;
          let accumulatedTokensOut = 0;
          
          await chatProvider.chatStream(history, { model: agent.model, temperature: body.temperature, maxTokens: body.maxTokens }, (chunk) => {
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
            // Save assistant response
            registry.createMessage(agentId, session.id, {
              role: "assistant",
              content: finalResult.content,
              tokensIn: finalResult.tokensIn,
              tokensOut: finalResult.tokensOut,
              model: finalResult.model
            });
            
            // Send final event
            const eventData = JSON.stringify({
              content: finalResult.content || "",
              accumulatedContent: finalResult.content || "",
              tokensIn: finalResult.tokensIn || 0,
              tokensOut: finalResult.tokensOut || 0,
              duration: finalResult.duration || 0,
              model: finalResult.model || agent.model,
              sessionId: session.id,
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
        return;
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
      const history = registry.listMessages(agentId, session.id).map((m) => ({
        role: m.role,
        content: m.content
      }));

      // Call provider (default to ollama, agent can override)
      const chatProvider = providers[agent.provider?.toLowerCase()] || providers[DEFAULT_PROVIDER];
      if (!chatProvider) return sendJson(response, 502, { error: `No provider configured for agent '${agent.name}' (tried '${agent.provider}')` });
      const result = await chatProvider.chat(history, { model: agent.model, temperature: body.temperature, maxTokens: body.maxTokens });

      // Save assistant response
      registry.createMessage(agentId, session.id, {
        role: "assistant",
        content: result.content,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        model: result.model
      });

      return sendJson(response, 200, {
        message: result.content,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        duration: result.duration,
        model: result.model,
        sessionId: session.id
      });
    }

    if (request.method === "GET" && url.pathname === "/api/agents") {
      try {
        const agents = registry.listAgents();
        
        // Limit response size to prevent DoS
        if (agents.length > 1000) {
          return sendJson(response, 200, { 
            agents: agents.slice(0, 1000),
            warning: "Response truncated to first 1000 agents"
          });
        }
        
        return sendJson(response, 200, { agents });
      } catch (err) {
        return sendJson(response, 500, { error: "Internal server error" });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/topology") {
      try {
        const topology = registry.getTopology();
        
        // Limit response size
        if (topology.agents && topology.agents.length > 1000) {
          topology.agents = topology.agents.slice(0, 1000);
        }
        
        return sendJson(response, 200, topology);
      } catch (err) {
        return sendJson(response, 500, { error: "Internal server error" });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/providers") {
      try {
        return sendJson(response, 200, providerSummary());
      } catch (err) {
        return sendJson(response, 500, { error: "Internal server error" });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/provider-readiness") {
      try {
        return sendJson(response, 200, {
          providers: listProviderConnections(process.env),
          summary: getProviderReadinessSummary(process.env)
        });
      } catch (err) {
        return sendJson(response, 500, { error: "Internal server error" });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/agents") {
      try {
        const body = await readRequestBody(request);
        const payload = parseCreateAgentInput(body);
        const agent = registry.createAgent(payload);
        return sendJson(response, 201, { agent });
      } catch (err) {
        return sendJson(response, 400, { error: err.message || "Invalid request body" });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/links") {
      try {
        const body = await readRequestBody(request);
        const payload = parseCreateLinkInput(body);
        const link = registry.createLink(payload);
        return sendJson(response, 201, { link });
      } catch (err) {
        return sendJson(response, 400, { error: err.message || "Invalid request body" });
      }
    }

    if (request.method === "GET") {
      try {
        const target = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const filePath = normalize(join(webRoot, target));
        
        // Enhanced path validation
        if (!filePath.startsWith(webRoot) || 
            relative(webRoot, filePath).startsWith("..") ||
            filePath.includes('..') || filePath.includes('~') || 
            filePath.includes('//') || filePath.includes('\0') ||
            !filePath || filePath.length > 1024) {
          return sendJson(response, 403, { error: "Forbidden: Invalid path" });
        }
        
        // Check file exists and is readable
        try {
          const stats = await readFile(filePath, { throwIfNoEntry: false });
          if (!stats) {
            return sendJson(response, 404, { error: "File not found" });
          }
          
          // Security: Don't serve sensitive files or directories
          const sensitiveFiles = ['.env', 'config', 'secret', 'private', 'key', 'password', 'cert', 'pem', 'key'];
          const sensitiveExtensions = ['.env', '.pem', '.key', '.p12', '.pfx', '.crt', '.cer'];
          const fileName = filePath.toLowerCase();
          
          // Check for sensitive file names
          if (sensitiveFiles.some(sensitive => fileName.includes(sensitive))) {
            return sendJson(response, 403, { error: "Forbidden: Cannot access this file" });
          }
          
          // Check for sensitive file extensions
          const fileExtension = extname(filePath).toLowerCase();
          if (sensitiveExtensions.includes(fileExtension)) {
            return sendJson(response, 403, { error: "Forbidden: Cannot access this file type" });
          }
          
          // Security headers for static files
          response.writeHead(200, { 
            "Content-Type": contentTypeFor(filePath),
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "strict-origin-when-cross-origin"
          });
          response.end(stats);
          return;
        } catch (fileErr) {
          console.error('File access error:', fileErr);
          return sendJson(response, 404, { error: "File not found" });
        }
      } catch (err) {
        console.error('File serving error:', err);
        return sendJson(response, 500, { error: "Internal server error" });
      }
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    let status = 500;
    let safeMessage = "Internal server error";
    
    // Determine error type and status more precisely
    if (error instanceof Error) {
      if (error.message.includes('validation') || error.message.includes('invalid')) {
        status = 400;
        safeMessage = "Invalid request";
      } else if (error.message.includes('not found')) {
        status = 404;
        safeMessage = "Resource not found";
      } else if (error.message.includes('forbidden') || error.message.includes('unauthorized')) {
        status = 403;
        safeMessage = "Access denied";
      } else if (error.message.includes('timeout')) {
        status = 408;
        safeMessage = "Request timeout";
      } else if (error.message.includes('rate limit')) {
        status = 429;
        safeMessage = "Rate limit exceeded";
      }
    }
    
    // Always log the actual error for debugging
    console.error(`Error ${status} for ${request.method} ${request.url}:`, error);
    
    // Send sanitized error response
    sendJson(response, status, { 
      error: safeMessage,
      requestId: crypto.randomUUID() // For tracking, not exposing stack traces
    });
  }
});

// Enhanced rate limiting middleware with better security
const applyRateLimit = (request, response) => {
  try {
    const clientIP = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'] || '';
    const timestamp = Date.now();
    
    // Validate client IP format
    if (!clientIP || typeof clientIP !== 'string') {
      response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'Invalid client IP' }));
      return false;
    }
    
    // Clean up old entries more efficiently
    cleanupRateLimitEntries();
    
    // Create secure rate limit key
    const rateLimitKey = createRateLimitKey(clientIP, timestamp);
    
    // Check if IP is rate limited
    if (rateLimit.has(rateLimitKey)) {
      const data = rateLimit.get(rateLimitKey);
      if (timestamp - data.timestamp < RATE_LIMIT_WINDOW && data.count >= MAX_REQUESTS_PER_MINUTE) {
        response.writeHead(429, {
          'Content-Type': 'application/json; charset=utf-8',
          'X-RateLimit-Limit': MAX_REQUESTS_PER_MINUTE,
          'X-RateLimit-Remaining': 0,
          'Retry-After': Math.ceil((RATE_LIMIT_WINDOW - (timestamp - data.timestamp)) / 1000),
          'X-Content-Type-Options': 'nosniff'
        });
        response.end(JSON.stringify({ 
          error: "Rate limit exceeded",
          message: `Max ${MAX_REQUESTS_PER_MINUTE} requests per minute per client allowed`,
          retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (timestamp - data.timestamp)) / 1000)
        }));
        return false;
      }
      
      // Increment count with bounds checking
      data.count = Math.min(data.count + 1, MAX_REQUESTS_PER_MINUTE);
      data.timestamp = timestamp;
    } else {
      // Create new entry with validation
      if (userAgent && userAgent.length > 500) {
        userAgent = userAgent.substring(0, 500);
      }
      rateLimit.set(rateLimitKey, { count: 1, timestamp: timestamp, userAgent });
    }
    
    return true;
  } catch (err) {
    console.error('Rate limit error:', err);
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Internal server error' }));
    return false;
  }
};

// Cleanup rate limit entries periodically
const cleanupRateLimitEntries = () => {
  const now = Date.now();
  for (const [key, data] of rateLimit.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      rateLimit.delete(key);
    }
  }
};

// Improved rate limit cleanup with better efficiency
const cleanupRateLimitInterval = setInterval(() => {
  const now = Date.now();
  const keysToDelete = [];
  
  // Collect keys to delete first to avoid modifying during iteration
  for (const [key, data] of rateLimit.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      keysToDelete.push(key);
    }
  }
  
  // Delete collected keys
  for (const key of keysToDelete) {
    rateLimit.delete(key);
  }
  
  // Prevent memory growth by enforcing maximum size
  if (rateLimit.size > MAX_REQUESTS_PER_MINUTE * 10) {
    // Keep only the most recent entries
    const sortedEntries = Array.from(rateLimit.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp);
    rateLimit.clear();
    for (const [key, data] of sortedEntries.slice(0, MAX_REQUESTS_PER_MINUTE * 5)) {
      rateLimit.set(key, data);
    }
  }
}, CONN_CLEANUP_INTERVAL);

// Clean up on exit
process.on('SIGINT', () => {
  cleanupRateLimitInterval.clear();
  rateLimit.clear();
});
process.on('SIGTERM', () => {
  cleanupRateLimitInterval.clear();
  rateLimit.clear();
});

// Clean up rate limit map on exit
process.on('SIGINT', () => {
  rateLimit.clear();
});
process.on('SIGTERM', () => {
  rateLimit.clear();
});

// Broadcast agent status updates to all connected clients
const broadcastAgentStatus = () => {
  const agents = registry.listAgents();
  const topology = registry.getTopology();
  
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
        concurrentTasks: registry.getCurrentTaskCount(agent.id),
        lastActivity: Date.now()
      })),
      systemStats: {
        uptime: Math.floor((Date.now() - startTime) / 1000),
        totalSessions: registry.getTotalSessions(),
        totalMessages: registry.getTotalMessages()
      }
    }
  };
  
  const message = JSON.stringify(statusUpdate);
  connectedClients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
};

// Graceful shutdown handler
const shutdown = (signal) => {
  console.log(`\nReceived ${signal}, starting graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      console.error('Error closing server:', err);
      process.exit(1);
    }
    
    console.log('Server closed successfully');
    
    // Close database connection if it exists
    if (registry?.db) {
      try {
        registry.db.close();
        console.log('Database connection closed');
      } catch (dbErr) {
        console.error('Error closing database:', dbErr);
      }
    }
    
    process.exit(0);
  });
  
  // Force exit after 10 seconds if graceful shutdown doesn't complete
  setTimeout(() => {
    console.error('Forceful exit after 10 seconds');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle WebSocket upgrade with authentication and origin validation
server.on('upgrade', (request, socket, head) => {
  try {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    
    if (pathname === '/ws') {
      // Validate WebSocket origin
      const origin = request.headers.origin;
      if (!isOriginAllowed(origin)) {
        console.error('WebSocket connection rejected from origin:', origin);
        socket.destroy();
        return;
      }
      
      // Simple authentication check (API key in query parameter)
      const url = new URL(request.url, `http://${request.headers.host}`);
      const apiKey = url.searchParams.get('auth');
      
      if (!apiKey) {
        console.error('WebSocket connection rejected: missing authentication');
        socket.destroy();
        return;
      }
      
      // Validate API key (you might want to check against a database or environment variable)
      const validApiKey = process.env.WEBSOCKET_API_KEY || crypto.randomBytes(32).toString('hex');
      if (apiKey !== validApiKey) {
        console.error('WebSocket connection rejected: invalid authentication');
        socket.destroy();
        return;
      }
      
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
        
        // Add client to set and send initial status
        connectedClients.add(ws);
        
        // Send initial status to new client
        try {
          broadcastAgentStatus();
        } catch (err) {
          console.error('Error broadcasting initial status:', err);
        }
        
        // Handle client disconnect
        ws.on('close', () => {
          connectedClients.delete(ws);
        });
        
        // Handle client errors
        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          connectedClients.delete(ws);
        });
        
        // Handle messages with validation
        ws.on('message', (message) => {
          try {
            // Only accept JSON messages
            const data = JSON.parse(message.toString());
            
            // Validate message structure
            if (!data || typeof data !== 'object') {
              throw new Error('Invalid message format');
            }
            
            // Log message but don't process it in this implementation
            console.log('Received WebSocket message:', {
              type: data.type || 'unknown',
              timestamp: Date.now(),
              hasData: !!data.data
            });
            
          } catch (err) {
            console.error('Invalid WebSocket message format:', err.message);
            ws.close(1008, 'Invalid message format');
          }
        });
      });
    } else {
      socket.destroy();
    }
  } catch (err) {
    console.error('WebSocket upgrade error:', err);
    socket.destroy();
  }
});

// Broadcast status updates every 30 seconds
setInterval(broadcastAgentStatus, 30 * 1000);

server.listen(port, host, () => {
  console.log(`Zsiistant v${VERSION} listening on http://${host}:${port}`);
  console.log(`WebSocket endpoint available at ws://${host}:${port}/ws`);
});
