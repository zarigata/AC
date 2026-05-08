import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { setInterval } from "node:timers";
import { WebSocketServer } from "ws";
import { createHash } from "node:crypto";

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
  if (!origin) return true; // No origin for non-browser requests
  return ALLOWED_ORIGINS.includes(origin);
};

const sendJson = (response, statusCode, payload) => {
  const origin = response.getHeader('origin');
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With"
  };
  
  if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  
  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(payload));
};

const MAX_JSON_PAYLOAD_SIZE = 1024 * 1024; // 1MB limit

const readRequestBody = async (request) => {
  let raw = "";
  let totalLength = 0;
  
  for await (const chunk of request) {
    totalLength += chunk.length;
    if (totalLength > MAX_JSON_PAYLOAD_SIZE) {
      throw new Error(`Payload too large (max ${MAX_JSON_PAYLOAD_SIZE / 1024 / 1024}MB)`);
    }
    raw += chunk;
  }

  if (!raw) return {};
  
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('Invalid JSON format');
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
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

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

    if (agentMatch) {
      const agentId = agentMatch[1];

      if (request.method === "GET") {
        const agent = registry.getAgent(agentId);
        if (!agent) return sendJson(response, 404, { error: "Agent not found" });
        return sendJson(response, 200, { agent });
      }

      if (request.method === "PATCH") {
        const body = await readRequestBody(request);
        const agent = registry.updateAgent(agentId, body);
        if (!agent) return sendJson(response, 404, { error: "Agent not found" });
        return sendJson(response, 200, { agent });
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
      const body = await readRequestBody(request);
      const session = registry.createSession(sessionsMatch[1], body);
      if (!session) return sendJson(response, 404, { error: "Agent not found" });
      return sendJson(response, 201, { session });
    }

    const sessionMsgMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/sessions\/([\w-]+)\/messages$/);

    if (sessionMsgMatch && request.method === "GET") {
      const messages = registry.listMessages(sessionMsgMatch[1], sessionMsgMatch[2]);
      return sendJson(response, 200, { messages });
    }

    if (sessionMsgMatch && request.method === "POST") {
      const body = await readRequestBody(request);
      const message = registry.createMessage(sessionMsgMatch[1], sessionMsgMatch[2], body);
      if (!message) return sendJson(response, 404, { error: "Not found" });
      return sendJson(response, 201, { message });
    }

    /* ─── Links ─── */

    if (request.method === "DELETE" && url.pathname === "/api/links") {
      const body = await readRequestBody(request);
      const deleted = registry.deleteLink(body);
      if (!deleted) return sendJson(response, 404, { error: "Link not found" });
      return sendJson(response, 200, { deleted: true });
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
      return sendJson(response, 200, { agents: registry.listAgents() });
    }

    if (request.method === "GET" && url.pathname === "/api/topology") {
      return sendJson(response, 200, registry.getTopology());
    }

    if (request.method === "GET" && url.pathname === "/api/providers") {
      return sendJson(response, 200, providerSummary());
    }

    if (request.method === "GET" && url.pathname === "/api/provider-readiness") {
      return sendJson(response, 200, {
        providers: listProviderConnections(process.env),
        summary: getProviderReadinessSummary(process.env)
      });
    }

    if (request.method === "POST" && url.pathname === "/api/agents") {
      const payload = parseCreateAgentInput(await readRequestBody(request));
      const agent = registry.createAgent(payload);
      return sendJson(response, 201, { agent });
    }

    if (request.method === "POST" && url.pathname === "/api/links") {
      const payload = parseCreateLinkInput(await readRequestBody(request));
      const link = registry.createLink(payload);
      return sendJson(response, 201, { link });
    }

    if (request.method === "GET") {
      const target = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const filePath = normalize(join(webRoot, target));
      if (relative(webRoot, filePath).startsWith("..") || !filePath.startsWith(webRoot)) {
        return sendJson(response, 403, { error: "Forbidden: Invalid path" });
      }
      
      // Additional security check for path traversal
      if (filePath.includes('..') || filePath.includes('~') || filePath.includes('//')) {
        return sendJson(response, 403, { error: "Forbidden: Invalid path characters" });
      }
      const asset = await readFile(filePath);
      response.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
      response.end(asset);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = error.status ?? 400;
    
    // Sanitize error messages to avoid information disclosure
    const safeMessage = status >= 500 ? "Internal server error" : message;
    
    console.error(`Error ${status} for ${request.method} ${request.url}:`, error);
    
    sendJson(response, status, { 
      error: safeMessage,
      requestId: crypto.randomUUID() // For tracking, not exposing stack traces
    });
  }
});

// Rate limiting middleware
const applyRateLimit = (request, response) => {
  const clientIP = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
  const userAgent = request.headers['user-agent'] || '';
  const now = Date.now();
  
  // Clean up old entries
  for (const [ip, data] of rateLimit.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      rateLimit.delete(ip);
    }
  }
  
  // Create a more unique key that includes IP and user agent fingerprint
  const userFingerprint = createHash('md5').update(`${clientIP}:${userAgent}`).digest('hex').slice(0, 8);
  
  // Check if IP is already rate limited
  if (rateLimit.has(userFingerprint)) {
    const data = rateLimit.get(userFingerprint);
    if (now - data.timestamp < RATE_LIMIT_WINDOW && data.count >= MAX_REQUESTS_PER_MINUTE) {
      sendJson(response, 429, { 
        error: "Rate limit exceeded",
        message: `Max ${MAX_REQUESTS_PER_MINUTE} requests per minute per client allowed`,
        retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - data.timestamp)) / 1000)
      });
      return false;
    }
    
    // Increment count
    data.count++;
    data.timestamp = now;
  } else {
    // Create new entry
    rateLimit.set(userFingerprint, { count: 1, timestamp: now });
  }
  
  return true;
};

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimit.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      rateLimit.delete(ip);
    }
  }
}, 5 * 60 * 1000);

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

// Handle WebSocket upgrade with origin validation
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  
  if (pathname === '/ws') {
    // Validate WebSocket origin
    const origin = request.headers.origin;
    if (!isOriginAllowed(origin)) {
      console.error('WebSocket connection rejected from origin:', origin);
      socket.destroy();
      return;
    }
    
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
      
      // Add client to set and send initial status
      connectedClients.add(ws);
      
      // Send initial status to new client
      broadcastAgentStatus();
      
      // Handle client disconnect
      ws.on('close', () => {
        connectedClients.delete(ws);
      });
      
      // Handle client errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        connectedClients.delete(ws);
      });
      
      // Handle messages
      ws.on('message', (message) => {
        try {
          // Only accept JSON messages
          const data = JSON.parse(message.toString());
          console.log('Received WebSocket message:', data);
        } catch (err) {
          console.error('Invalid WebSocket message format');
          ws.close(1008, 'Invalid message format');
        }
      });
    });
  } else {
    socket.destroy();
  }
});

// Broadcast status updates every 30 seconds
setInterval(broadcastAgentStatus, 30 * 1000);

server.listen(port, host, () => {
  console.log(`Zsiistant v${VERSION} listening on http://${host}:${port}`);
  console.log(`WebSocket endpoint available at ws://${host}:${port}/ws`);
});
