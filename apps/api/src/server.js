import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { setInterval } from "node:timers";
import { WebSocketServer } from "node:ws";

import {
  getProviderReadinessSummary,
  listProviderConnections,
  listProviders,
  parseCreateAgentInput,
  parseCreateLinkInput
} from "../../../packages/shared/src/index.js";

import { OllamaAdapter } from "./adapters/ollama.js";
import { AgentRegistry } from "./registry.js";

const ollama = new OllamaAdapter({ model: "qwen3:0.6b" });
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

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, { 
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  response.end(JSON.stringify(payload));
};

const readRequestBody = async (request) => {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
  }

  return raw ? JSON.parse(raw) : {};
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
  const providers = listProviders();
  return {
    providers,
    summary: {
      total: providers.length,
      local: providers.filter((provider) => provider.category === "local").length,
      cloud: providers.filter((provider) => provider.category === "cloud").length,
      selfHosted: providers.filter((provider) => provider.category === "self-hosted").length,
      routers: providers.filter((provider) => provider.category === "router").length
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
    response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
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

    /* ─── Provider Health (Ollama) ─── */

    if (request.method === "GET" && url.pathname === "/api/providers/health") {
      const health = await ollama.health();
      return sendJson(response, 200, { ollama: health });
    }

    /* ─── Agent Chat (via Ollama) ─── */

    const chatMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/chat$/);

    if (chatMatch && request.method === "POST") {
      const agentId = chatMatch[1];
      const agent = registry.getAgent(agentId);
      if (!agent) return sendJson(response, 404, { error: "Agent not found" });

      const body = await readRequestBody(request);
      const userMessage = body.message || body.content || "";
      if (!userMessage.trim()) return sendJson(response, 400, { error: "Message is required" });

      // Create or reuse session
      const sessions = registry.listSessions(agentId);
      let session = sessions.length > 0 ? sessions[0] : registry.createSession(agentId, { title: "Chat" });

      // Save user message
      registry.createMessage(agentId, session.id, {
        role: "user",
        content: userMessage,
        tokensIn: 0
      });

      // Build message history for Ollama
      const history = registry.listMessages(agentId, session.id).map((m) => ({
        role: m.role,
        content: m.content
      }));

      // Call Ollama
      const result = await ollama.chat(history, { model: agent.model });

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
      if (relative(webRoot, filePath).startsWith("..")) {
        return sendJson(response, 403, { error: "Forbidden" });
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
    sendJson(response, status, { error: message });
  }
});

// Rate limiting middleware
const applyRateLimit = (request, response) => {
  const clientIP = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
  const now = Date.now();
  
  // Clean up old entries
  for (const [ip, data] of rateLimit.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      rateLimit.delete(ip);
    }
  }
  
  // Check if IP is already rate limited
  if (rateLimit.has(clientIP)) {
    const data = rateLimit.get(clientIP);
    if (now - data.timestamp < RATE_LIMIT_WINDOW && data.count >= MAX_REQUESTS_PER_MINUTE) {
      sendJson(response, 429, { 
        error: "Rate limit exceeded",
        message: `Max ${MAX_REQUESTS_PER_MINUTE} requests per minute per IP allowed`,
        retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - data.timestamp)) / 1000)
      });
      return false;
    }
    
    // Increment count
    data.count++;
    data.timestamp = now;
  } else {
    // Create new entry
    rateLimit.set(clientIP, { count: 1, timestamp: now });
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

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  
  if (pathname === '/ws') {
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
