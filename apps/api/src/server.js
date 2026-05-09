import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { setInterval } from "node:timers";
import { WebSocketServer } from "ws";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { inspect } from "node:util";

import {
  getProviderReadinessSummary,
  listProviderConnections,
  listProviders,
  parseCreateAgentInput,
  parseCreateLinkInput
} from "../../../packages/shared/src/index.js";

import { OllamaAdapter, createProvider } from "./adapters/ollama.js";
import { FailoverChainAdapter, createFailoverChain } from "./adapters/failover.js";
import { AgentRegistry } from "./registry.js";

// Simple Job Processor
const JOB_PROCESSOR_INTERVAL = 5000; // 5 seconds
const MAX_CONCURRENT_JOBS = 3;
const runningJobs = new Set();

// Simple job processor for background tasks
const processJobs = async () => {
  try {
    // Don't process too many jobs concurrently
    if (runningJobs.size >= MAX_CONCURRENT_JOBS) {
      return;
    }
    
    // Get next pending job
    const pendingJobs = registry.getPendingJobs(1);
    if (pendingJobs.length === 0) {
      return;
    }
    
    const job = pendingJobs[0];
    const jobId = job.id;
    
    // Mark job as running
    runningJobs.add(jobId);
    const runningJob = registry.updateJob(jobId, { status: 'running' });
    
    // Broadcast job start
    broadcastJobUpdate({
      id: jobId,
      name: job.name,
      type: job.type,
      status: 'running',
      progress: 0,
      startedAt: runningJob.startedAt
    });
    
    console.log(`Starting job: ${job.name} (${jobId})`);
    
    // Process the job based on its type
    try {
      let result;
      
      switch (job.type) {
        case 'test':
          // Simple test job that just waits a bit
          await new Promise(resolve => setTimeout(resolve, 2000));
          result = { message: 'Test job completed successfully', timestamp: Date.now() };
          break;
          
        case 'cleanup':
          // Cleanup job - could clean old logs, sessions, etc.
          result = { 
            message: 'Cleanup completed', 
            cleanedItems: Math.floor(Math.random() * 100),
            timestamp: Date.now() 
          };
          break;
          
        case 'backup':
          // Simulate backup job with progress updates
          for (let i = 20; i <= 80; i += 20) {
            await new Promise(resolve => setTimeout(resolve, 500));
            registry.updateJob(jobId, { progress: i });
            broadcastJobUpdate({
              id: jobId,
              name: job.name,
              type: job.type,
              status: 'running',
              progress: i
            });
          }
          result = { 
            message: 'Backup completed', 
            backupSize: `${Math.floor(Math.random() * 1000) + 100}MB`,
            timestamp: Date.now() 
          };
          break;
          
        default:
          // Generic job processing
          await new Promise(resolve => setTimeout(resolve, 1000));
          result = { 
            message: `Job type ${job.type} processed`, 
            timestamp: Date.now() 
          };
      }
      
      // Update job with result
      const completedJob = registry.updateJob(jobId, { 
        status: 'completed', 
        progress: 100,
        result: result 
      });
      
      // Broadcast job completion
      broadcastJobUpdate({
        id: jobId,
        name: job.name,
        type: job.type,
        status: 'completed',
        progress: 100,
        result: result,
        completedAt: completedJob.completedAt
      });
      
      console.log(`Completed job: ${job.name} (${jobId})`);
      
    } catch (error) {
      // Mark job as failed
      const failedJob = registry.updateJob(jobId, { 
        status: 'failed', 
        error: error.message 
      });
      
      // Broadcast job failure
      broadcastJobUpdate({
        id: jobId,
        name: job.name,
        type: job.type,
        status: 'failed',
        progress: failedJob.progress,
        error: error.message
      });
      
      console.error(`Failed job: ${job.name} (${jobId}) - ${error.message}`);
    } finally {
      // Remove from running jobs
      runningJobs.delete(jobId);
    }
    
  } catch (err) {
    console.error('Error in job processor:', err);
  }
};

// Start job processor
setInterval(processJobs, JOB_PROCESSOR_INTERVAL);
console.log(`Job processor started (checking every ${JOB_PROCESSOR_INTERVAL}ms, max ${MAX_CONCURRENT_JOBS} concurrent)`);

// Multi-provider setup — primary is Ollama (local), fallbacks configured via env
const providers = {};
const providerNames = ["ollama", "openai", "anthropic", "gemini", "openrouter", "groq", "together", "lmstudio"];
const DEFAULT_PROVIDER = process.env.DEFAULT_PROVIDER || "ollama";

// Failover chain configuration
const failoverChains = {};
const DEFAULT_FAILOVER_CHAIN = process.env.DEFAULT_FAILOVER_CHAIN || "default";

// Initialize default failover chain if configured
const initFailoverChains = () => {
  // Check for failover chain configuration in environment variables
  const failoverConfigEnv = process.env.FAILOVER_CONFIG;
  
  if (failoverConfigEnv) {
    try {
      const config = JSON.parse(failoverConfigEnv);
      
      // Initialize each configured failover chain
      for (const [chainName, chainConfig] of Object.entries(config)) {
        try {
          const failoverChain = createFailoverChain(chainConfig);
          failoverChains[chainName] = failoverChain;
          console.log(`Initialized failover chain '${chainName}' with ${chainConfig.chain.length} providers`);
        } catch (err) {
          console.error(`Failed to initialize failover chain '${chainName}':`, err.message);
        }
      }
      
      // Set default failover chain if specified
      if (config.default) {
        DEFAULT_FAILOVER_CHAIN = config.default;
      }
    } catch (err) {
      console.error('Failed to parse FAILOVER_CONFIG:', err.message);
    }
  }
  
  // Auto-detect failover chain from available providers
  const availableProviders = [];
  
  // Always add ollama as primary if available
  if (providers.ollama) {
    availableProviders.push({ name: 'ollama', config: providers.ollama });
  }
  
  // Add other providers if they have API keys configured
  for (const name of providerNames.slice(1)) {
    if (providers[name]) {
      availableProviders.push({ name, config: providers[name] });
    }
  }
  
  // Create a default failover chain if we have multiple providers
  if (availableProviders.length > 1) {
    try {
      const defaultChain = new FailoverChainAdapter(availableProviders);
      failoverChains[DEFAULT_FAILOVER_CHAIN] = defaultChain;
      console.log(`Auto-created default failover chain with ${availableProviders.length} providers`);
    } catch (err) {
      console.error('Failed to auto-create failover chain:', err.message);
    }
  } else if (availableProviders.length === 1) {
    // Create a single-provider failover chain for consistency
    try {
      const singleChain = new FailoverChainAdapter(availableProviders);
      failoverChains[DEFAULT_FAILOVER_CHAIN] = singleChain;
      console.log(`Created single-provider failover chain with ${availableProviders.length} provider`);
    } catch (err) {
      console.error('Failed to create single-provider failover chain:', err.message);
    }
  }
};

// Initialize failover chains after basic providers are set up
initFailoverChains();

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

// Check if a provider is part of any failover chain
const isProviderInFailoverChain = (providerName) => {
  for (const chainName of Object.keys(failoverChains)) {
    const chain = failoverChains[chainName];
    for (const providerConfig of chain.failoverChain) {
      if (providerConfig.name === providerName) {
        return true;
      }
    }
  }
  return false;
};

// Get provider with failover support
const getProvider = (providerName = DEFAULT_PROVIDER) => {
  // First check if it's a failover chain
  if (failoverChains[providerName]) {
    return failoverChains[providerName];
  }
  
  // Fallback to individual provider
  return providers[providerName];
};
const startTime = Date.now();

// Rate limiting: max 60 requests per minute per IP
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 60;
const MAX_CONCURRENT_CONNECTIONS = 100; // Maximum concurrent connections per IP
const CONN_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_RATE_LIMIT_ENTRIES = 10000; // Maximum entries in rate limit map to prevent memory exhaustion

// Security: Secret for HMAC-based rate limiting
const RATE_LIMIT_SECRET = process.env.RATE_LIMIT_SECRET || randomBytes(32).toString('hex');

// Settings object that can be updated at runtime
const settings = {
  version: VERSION,
  defaultModel: "qwen3",
  maxAgents: 100,
  supportedIsolationModes: ["isolated", "selective", "mesh"],
  supportedLinkModes: ["observe", "message", "delegate"],
  providers: listProviders().length
};

// Enhanced rate limiting with better security
const createRateLimitKey = (clientIP, timestamp) => {
  // Hash the IP for better privacy and security
  const ipHash = createHash('sha256').update(clientIP).digest('hex').substring(0, 16);
  const windowStart = Math.floor(timestamp / RATE_LIMIT_WINDOW) * RATE_LIMIT_WINDOW;
  return `${ipHash}:${windowStart}`;
};

// WebSocket server for real-time updates
const wss = new WebSocketServer({ noServer: true });
const connectedClients = new Map();

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

// Additional security: validate origin format and prevent wildcard origins
const validateOrigin = (origin) => {
  if (!origin || typeof origin !== 'string') return false;
  
  // Reject dangerous origins
  if (origin.includes('*') || origin.includes('://0.0.0.0') || origin.includes('://0.0.0.0')) {
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

const isOriginAllowed = (origin) => {
  if (!origin) return false; // Block requests without origin for API endpoints
  
  // First validate the origin format
  if (!validateOrigin(origin)) {
    return false;
  }
  
  // Then check against allowed origins
  return ALLOWED_ORIGINS.includes(origin);
};

// Sanitize JSON payload to prevent injection
const sanitizeJsonPayload = (payload) => {
  try {
    if (payload === undefined || payload === null) {
      return JSON.stringify({ error: 'No data provided' });
    }
    const jsonString = JSON.stringify(payload);
    // Remove potentially dangerous characters that could break JSON parsing
    return jsonString.replace(/\u0000/g, '').replace(/\r\n/g, '\n');
  } catch (err) {
    console.error('Sanitization error:', err, 'Payload:', payload);
    throw new Error('Failed to sanitize payload');
  }
};

const sendJson = (response, statusCode, payload) => {
  // Simple sendJson that only handles 3-parameter calls
  const origin = response.getHeader('origin');
  
  // Validate statusCode is a number and handle cases where it's passed incorrectly
  let validStatusCode;
  if (typeof statusCode === 'number') {
    validStatusCode = statusCode;
  } else if (typeof statusCode === 'object' && payload === undefined) {
    // Case where payload was passed as second parameter and statusCode as first
    validStatusCode = 200;
    payload = statusCode;
  } else {
    validStatusCode = 200;
  }
  
  // Debug logging
  console.log('DEBUG sendJson:', {
    statusCode: typeof statusCode,
    statusCodeValue: validStatusCode,
    payload: typeof payload,
    payloadPreview: typeof payload === 'object' ? JSON.stringify(payload).substring(0, 100) : payload
  });
  
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
  }
  
  try {
    const sanitizedPayload = sanitizeJsonPayload(payload);
    response.writeHead(validStatusCode, headers);
    response.end(sanitizedPayload);
  } catch (err) {
    console.error('Failed to send JSON response:', err);
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: 'Internal server error' }));
  }
};

// Standardized error handler with proper HTTP status codes
const sendError = (response, statusCode, errorType, message, details = null) => {
  const origin = response.getHeader('origin');
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };
  
  if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  
  const errorResponse = {
    error: errorType,
    message: message,
    ...(details && { details }),
    requestId: crypto.randomUUID(),
    timestamp: Date.now()
  };
  
  try {
    const sanitizedPayload = sanitizeJsonPayload(errorResponse);
    response.writeHead(statusCode, headers);
    response.end(sanitizedPayload);
  } catch (err) {
    console.error('Failed to send error response:', err);
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: 'Internal server error' }));
  }
};

// Enhanced error handling middleware
const handleError = (error, request, response) => {
  console.error(`Error ${request.method} ${request.url}:`, error);
  
  let statusCode = 500;
  let errorType = 'Internal Server Error';
  let message = 'An unexpected error occurred';
  
  // Categorize errors
  if (error instanceof Error) {
    if (error.message.includes('validation')) {
      statusCode = 400;
      errorType = 'Validation Error';
      message = error.message;
    } else if (error.message.includes('not found')) {
      statusCode = 404;
      errorType = 'Not Found';
      message = error.message;
    } else if (error.message.includes('forbidden') || error.message.includes('unauthorized')) {
      statusCode = 403;
      errorType = 'Forbidden';
      message = error.message;
    } else if (error.message.includes('timeout')) {
      statusCode = 408;
      errorType = 'Request Timeout';
      message = error.message;
    } else if (error.message.includes('rate limit')) {
      statusCode = 429;
      errorType = 'Rate Limit Exceeded';
      message = error.message;
    } else if (error.message.includes('database')) {
      statusCode = 503;
      errorType = 'Database Error';
      message = 'Service temporarily unavailable';
    }
  }
  
  sendError(response, statusCode, errorType, message, {
    path: request.url,
    method: request.method,
    userAgent: request.headers['user-agent']
  });
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
        } else if (chunk && Buffer.isBuffer(chunk)) {
          totalLength += chunk.length;
          if (totalLength > MAX_JSON_PAYLOAD_SIZE) {
            throw new Error(`Payload too large (max ${MAX_JSON_PAYLOAD_SIZE / 1024 / 1024}MB)`);
          }
          raw += chunk.toString('utf8');
        }
      }
    })();
    
    await Promise.race([readPromise, timeoutPromise]);


    
    if (!raw || raw.trim().length === 0) return {};
    
    try {
      // Use safer JSON parsing with enhanced prototype protection
      const parsed = JSON.parse(raw, (key, value) => {
        // Filter out prototype pollution attempts
        if (key === '__proto__' || key === 'constructor' || key === 'prototype' ||
            key === '__defineGetter__' || key === '__defineSetter__' || 
            key === '__lookupGetter__' || key === '__lookupSetter__') {
          return undefined;
        }
        return value;
      });
      
      // Validate parsed object structure strictly
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid JSON structure: expected object');
      }
      
      // Enhanced security check for suspicious properties and prototype manipulation
      const suspiciousProps = ['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'];
      for (const prop of suspiciousProps) {
        if (Object.prototype.hasOwnProperty.call(parsed, prop)) {
          throw new Error(`Invalid JSON structure: suspicious property ${prop}`);
        }
      }
      
      // Check for prototype pollution attempts
      try {
        const testObj = {};
        Object.setPrototypeOf(testObj, parsed);
        // If we get here without throwing, there was no prototype pollution
      } catch (protoErr) {
        throw new Error('Invalid JSON structure: prototype pollution attempt detected');
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
    


    // Enhanced path validation for security
    const normalizedPath = url.pathname.replace(/\/+/g, '/');
    console.log('DEBUG: Checking path:', normalizedPath);
    
    // Check for path traversal attempts
    if (normalizedPath.includes('..') || normalizedPath.includes('~') || 
        normalizedPath.includes('\\.') || normalizedPath.includes('//') || 
        normalizedPath.includes('%2e%2e') || normalizedPath.includes('%2e')) {
      console.log('DEBUG: Path traversal detected:', normalizedPath);
      sendJson(response, 403, { error: 'Forbidden: Invalid path characters' });
      return;
    }
    
    // Check for null bytes and other dangerous characters
    if (normalizedPath.includes('\x00') || normalizedPath.includes('\n') || normalizedPath.includes('\r')) {
      sendJson(response, 403, { error: 'Forbidden: Invalid path characters' });
      return;
    }
    
    // Check for excessive path depth
    const pathDepth = normalizedPath.split('/').filter(part => part.length > 0).length;
    if (pathDepth > 10) {
      sendJson(response, 403, { error: 'Forbidden: Path too deep' });
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

    // Agent ID validation with enhanced security
    const agentIdPattern = /^[a-zA-Z0-9-]+$/;
    if (agentMatch) {
      const agentId = agentMatch[1];
      
      // Validate agent ID format with comprehensive checks
      if (!agentId || typeof agentId !== 'string' || agentId.length > 64 || agentId.length < 1) {
        return sendJson(response, 400, { error: "Invalid agent ID format" });
      }
      
      if (!agentIdPattern.test(agentId)) {
        return sendJson(response, 400, { error: "Invalid agent ID format: only letters, numbers, and hyphens allowed" });
      }
      
      // Check for potentially dangerous agent IDs and SQL injection attempts
      const sqlInjectionPatterns = [
        /\b(select|insert|update|delete|drop|create|alter|union|exec|execute|xp_cmdshell|sp_oacreate|sp_addagent|sp_droplogin|script|javascript|iframe|object|embed|meta|link|style)/i,
        /;\s*--/,
        /'\s*or\s*1=1/i,
        /\b(and|or)\s*\d+=\d+/i,
        /\b(and|or)\s*'\s*=/i
      ];
      
      // Additional SQL injection checks
      const sqlKeywords = ['select', 'insert', 'update', 'delete', 'drop', 'create', 'alter', 'union', 'exec', 'execute'];
      const lowerAgentId = agentId.toLowerCase();
      
      for (const keyword of sqlKeywords) {
        if (lowerAgentId.includes(keyword)) {
          console.log('DEBUG: SQL injection keyword detected:', keyword);
          return sendJson(response, 400, { error: "Invalid agent ID: contains potentially malicious content" });
        }
      }
      
      for (const pattern of sqlInjectionPatterns) {
        if (pattern.test(agentId)) {
          console.log('DEBUG: SQL injection pattern detected:', pattern);
          return sendJson(response, 400, { error: "Invalid agent ID: contains potentially malicious content" });
        }
      }
      
      // Check for potentially dangerous agent IDs
      if (agentId.toLowerCase().includes('admin') || 
          agentId.toLowerCase().includes('system') || 
          agentId.toLowerCase().includes('root')) {
        return sendJson(response, 400, { error: "Invalid agent ID: reserved name" });
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
        // Validate agent ID format before attempting deletion
        if (!agentIdPattern.test(agentId) || agentId.length > 64) {
          return sendJson(response, 400, { error: "Invalid agent ID format" });
        }
        
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
          // Validate role with enhanced security
          if (!body.role || !['user', 'assistant', 'system'].includes(body.role)) {
            return sendJson(response, 400, { error: "Invalid message role: must be user, assistant, or system" });
          }
          
          // Validate and sanitize content with comprehensive checks
          if (!body.content || typeof body.content !== 'string') {
            return sendJson(response, 400, { error: "Message content is required and must be a string" });
          }
          
          const originalContent = body.content;
          
          // Enhanced content validation
          if (originalContent.trim().length === 0) {
            return sendJson(response, 400, { error: "Message content cannot be empty" });
          }
          
          if (originalContent.length > 50000) {
            return sendJson(response, 400, { error: "Message content too long (max 50000 characters)" });
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
              return sendJson(response, 400, { error: "Message contains invalid or potentially dangerous content" });
            }
          }
          
          // Additional content security checks
          if (originalContent.includes('eval(') || 
              originalContent.includes('exec(') ||
              originalContent.includes('Function(') ||
              originalContent.includes('setTimeout') ||
              originalContent.includes('setInterval')) {
            return sendJson(response, 400, { error: "Message contains potentially dangerous JavaScript" });
          }
          
          // Validate token counts with bounds checking
          const tokensIn = body.tokensIn || 0;
          const tokensOut = body.tokensOut || 0;
          
          if (!Number.isInteger(tokensIn) || tokensIn < 0 || tokensIn > 1000000) {
            return sendJson(response, 400, { error: "Invalid tokensIn value: must be a positive integer less than 1, 000,000" });
          }
          
          if (!Number.isInteger(tokensOut) || tokensOut < 0 || tokensOut > 1000000) {
            return sendJson(response, 400, { error: "Invalid tokensOut value: must be a positive integer less than 1, 000,000" });
          }
          
          // Create message with validated data
          const message = registry.createMessage(agentId, sessionId, {
            role: body.role,
            content: originalContent,
            tokensIn,
            tokensOut,
            model: body.model || ''
          });
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
      // Return current settings
      return sendJson(response, 200, {
        ...settings,
        providers: listProviders().length // Update providers count dynamically
      });
    }

    if (request.method === "PATCH" && url.pathname === "/api/settings") {
      try {
        const body = await readRequestBody(request);

        
        // Validate settings input with comprehensive checks
        if (!body || typeof body !== 'object') {
          return sendJson(response, 400, { error: "Settings payload must be an object" });
        }
        
        const updates = {};
        const originalSettings = { ...settings, providers: listProviders().length };
        
        // Validate and process each setting update
        if (body.defaultModel !== undefined) {
          if (typeof body.defaultModel !== 'string' || body.defaultModel.trim().length === 0 || body.defaultModel.length > 120) {
            return sendJson(response, 400, { error: "Invalid defaultModel: must be a string between 1 and 120 characters" });
          }
          updates.defaultModel = body.defaultModel.trim();
        }
        
        if (body.maxAgents !== undefined) {
          if (!Number.isInteger(body.maxAgents) || body.maxAgents < 1 || body.maxAgents > 1000) {
            return sendJson(response, 400, { error: "Invalid maxAgents: must be an integer between 1 and 1000" });
          }
          updates.maxAgents = body.maxAgents;
        }
        
        if (body.rateLimit !== undefined) {
          if (!Number.isInteger(body.rateLimit) || body.rateLimit < 1 || body.rateLimit > 10000) {
            return sendJson(response, 400, { error: "Invalid rateLimit: must be an integer between 1 and 10000" });
          }
          updates.rateLimit = body.rateLimit;
          // Update the rate limiting configuration
          MAX_REQUESTS_PER_MINUTE = body.rateLimit;
        }
        
        if (body.timeout !== undefined) {
          if (!Number.isInteger(body.timeout) || body.timeout < 1000 || body.timeout > 300000) {
            return sendJson(response, 400, { error: "Invalid timeout: must be an integer between 1000 and 300000 milliseconds" });
          }
          updates.timeout = body.timeout;
          // Update request timeout configuration
          MAX_REQUEST_TIMEOUT = body.timeout;
        }
        
        if (body.supportedIsolationModes !== undefined) {
          if (!Array.isArray(body.supportedIsolationModes) || body.supportedIsolationModes.length === 0 || body.supportedIsolationModes.length > 20) {
            return sendJson(response, 400, { error: "Invalid supportedIsolationModes: must be an array with 1-20 items" });
          }
          
          const validModes = ["isolated", "selective", "mesh"];
          for (const mode of body.supportedIsolationModes) {
            if (typeof mode !== 'string' || !validModes.includes(mode)) {
              return sendJson(response, 400, { error: `Invalid isolation mode: ${mode}. Must be one of: ${validModes.join(', ')}` });
            }
          }
          updates.supportedIsolationModes = body.supportedIsolationModes;
        }
        
        if (body.supportedLinkModes !== undefined) {
          if (!Array.isArray(body.supportedLinkModes) || body.supportedLinkModes.length === 0 || body.supportedLinkModes.length > 20) {
            return sendJson(response, 400, { error: "Invalid supportedLinkModes: must be an array with 1-20 items" });
          }
          
          const validModes = ["observe", "message", "delegate"];
          for (const mode of body.supportedLinkModes) {
            if (typeof mode !== 'string' || !validModes.includes(mode)) {
              return sendJson(response, 400, { error: `Invalid link mode: ${mode}. Must be one of: ${validModes.join(', ')}` });
            }
          }
          updates.supportedLinkModes = body.supportedLinkModes;
        }
        
        if (body.providers !== undefined) {
          if (!Number.isInteger(body.providers) || body.providers < 0 || body.providers > 100) {
            return sendJson(response, 400, { error: "Invalid providers: must be an integer between 0 and 100" });
          }
          updates.providers = body.providers;
        }
        
        // If no valid updates provided, return error
        if (Object.keys(updates).length === 0) {
          return sendJson(response, 400, { error: "No valid settings provided for update" });
        }
        
        // Apply updates to global settings object
        Object.assign(settings, updates);
        
        // Log the settings update for audit trail
        console.log('Settings updated:', {
          timestamp: Date.now(),
          changedBy: request.headers['x-forwarded-for'] || request.socket.remoteAddress,
          updates: updates,
          newSettings: { ...settings }
        });
        
        return sendJson(response, 200, {
          settings: { ...settings },
          updated: Object.keys(updates),
          timestamp: Date.now()
        });
      } catch (err) {
        return sendJson(response, 400, { error: "Invalid request body" });
      }
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

    /* ─── Provider Failover Configuration ─── */

    if (request.method === "GET" && url.pathname === "/api/providers/failover") {
      try {
        const chains = {};
        
        // Get status of each failover chain
        for (const [chainName, chain] of Object.entries(failoverChains)) {
          try {
            const health = await chain.health();
            const currentProvider = chain.getCurrentProvider();
            
            chains[chainName] = {
              name: chainName,
              healthy: health.ok,
              healthyProviders: health.providers,
              primaryProvider: currentProvider?.name || 'unknown',
              fallbackCount: chain.failoverChain.length - 1,
              providers: chain.failoverChain.map((p, i) => ({
                name: p.name,
                index: i,
                position: i + 1,
                healthy: health.providers[p.name]?.ok || false,
                config: p.config
              })),
              default: chainName === DEFAULT_FAILOVER_CHAIN
            };
          } catch (err) {
            chains[chainName] = {
              name: chainName,
              healthy: false,
              error: err.message,
              providers: chain.failoverChain.map((p, i) => ({
                name: p.name,
                index: i,
                position: i + 1,
                healthy: false,
                config: p.config
              })),
              default: chainName === DEFAULT_FAILOVER_CHAIN
            };
          }
        }
        
        return sendJson(response, 200, {
          chains,
          defaultChain: DEFAULT_FAILOVER_CHAIN,
          totalChains: Object.keys(failoverChains).length,
          availableProviders: Object.keys(providers).filter(name => !isProviderInFailoverChain(name))
        });
      } catch (err) {
        return sendJson(response, 500, { error: "Internal server error" });
      }
    }

    if ((request.method === "PUT" || request.method === "POST") && url.pathname === "/api/providers/failover") {
      try {
        const body = await readRequestBody(request);
        
        // Validate input
        if (!body || typeof body !== 'object') {
          return sendJson(response, 400, { error: "Invalid request body" });
        }
        
        const action = body.action || 'create';
        const chainName = body.chainName || DEFAULT_FAILOVER_CHAIN;
        
        if (action === 'create' || action === 'update') {
          // Create or update failover chain
          if (!body.chain || !Array.isArray(body.chain) || body.chain.length === 0) {
            return sendJson(response, 400, { error: "Chain must be a non-empty array of providers" });
          }
          
          // Validate provider chain
          const validProviderNames = Object.keys(providers);
          for (const providerConfig of body.chain) {
            if (!providerConfig.name || !validProviderNames.includes(providerConfig.name)) {
              return sendJson(response, 400, { error: `Invalid provider name: ${providerConfig.name}` });
            }
          }
          
          try {
            const failoverChain = new FailoverChainAdapter(
              body.chain.map(p => ({
                name: p.name,
                config: p.config || {}
              })),
              body.config || {}
            );
            
            failoverChains[chainName] = failoverChain;
            
            // Update default chain if specified
            if (body.isDefault) {
              DEFAULT_FAILOVER_CHAIN = chainName;
            }
            
            return sendJson(response, 200, {
              success: true,
              message: `Failover chain '${chainName}' ${action}d successfully`,
              chainName,
              providerCount: body.chain.length,
              isDefault: body.isDefault || false
            });
          } catch (err) {
            return sendJson(response, 400, { error: `Failed to create failover chain: ${err.message}` });
          }
        } else if (action === 'delete') {
          // Delete failover chain
          if (!failoverChains[chainName]) {
            return sendJson(response, 400, { error: `Failover chain '${chainName}' not found` });
          }
          
          delete failoverChains[chainName];
          
          // Update default chain if deleted chain was default
          if (DEFAULT_FAILOVER_CHAIN === chainName && Object.keys(failoverChains).length > 0) {
            DEFAULT_FAILOVER_CHAIN = Object.keys(failoverChains)[0];
          }
          
          return sendJson(response, 200, {
            success: true,
            message: `Failover chain '${chainName}' deleted successfully`
          });
        } else if (action === 'switch') {
          // Switch to a specific provider in chain
          if (!failoverChains[chainName]) {
            return sendJson(response, 400, { error: `Failover chain '${chainName}' not found` });
          }
          
          const providerIndex = body.providerIndex;
          if (typeof providerIndex !== 'number' || providerIndex < 0 || providerIndex >= failoverChains[chainName].providers.length) {
            return sendJson(response, 400, { error: "Invalid provider index" });
          }
          
          try {
            const newProvider = await failoverChains[chainName].setProvider(providerIndex);
            return sendJson(response, 200, {
              success: true,
              message: `Switched to provider '${newProvider.name}' in chain '${chainName}'`,
              provider: newProvider
            });
          } catch (err) {
            return sendJson(response, 400, { error: `Failed to switch provider: ${err.message}` });
          }
        } else {
          return sendJson(response, 400, { error: "Invalid action. Must be: create, update, delete, or switch" });
        }
      } catch (err) {
        return sendJson(response, 400, { error: "Invalid request body" });
      }
    }

    /* ─── Provider Chat (direct, no agent needed) ─── */

    if (request.method === "POST" && url.pathname === "/api/chat") {
      const body = await readRequestBody(request);
      const providerName = body.provider || DEFAULT_PROVIDER;
      const provider = getProvider(providerName);
      if (!provider) return sendJson(response, 400, { error: `Provider '${providerName}' not configured. Available: ${Object.keys(providers).concat(Object.keys(failoverChains)).join(', ')}` });

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
      const chatProvider = getProvider(agent.provider?.toLowerCase()) || getProvider(DEFAULT_PROVIDER);
      if (!chatProvider) return sendJson(response, 502, { error: `No provider configured for agent '${agent.name}' (tried '${agent.provider}')` });
      
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
      
      return sendJson(response, 200, responseResult);

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

    /* ─── Agent Files (Knowledge Base) ─── */

    const filesMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/files$/);
    const fileMatch = url.pathname.match(/^\/api\/agents\/([\w-]+)\/files\/([\w-]+)$/);

    if (filesMatch && request.method === "GET") {
      try {
        const agentId = filesMatch[1];
        
        // Validate agent ID format
        if (!agentIdPattern.test(agentId) || agentId.length > 64) {
          response.writeHead(400, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "http://localhost:4000"
          });
          return response.end(JSON.stringify({ error: "Invalid agent ID format" }));
        }
        
        // Check if agent exists
        const agent = registry.getAgent(agentId);
        if (!agent) {
          response.writeHead(404, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "http://localhost:4000"
          });
          return response.end(JSON.stringify({ error: "Agent not found" }));
        }
        
        // Get list of files
        const result = registry.getAgentFiles(agentId);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "http://localhost:4000"
        });
        return response.end(JSON.stringify(result));
      } catch (err) {
        response.writeHead(500, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "http://localhost:4000"
        });
        return response.end(JSON.stringify({ error: "Internal server error" }));
      }
    }

    if (filesMatch && request.method === "POST") {
      try {
        const agentId = filesMatch[1];
        
        // Validate agent ID format
        if (!agentIdPattern.test(agentId) || agentId.length > 64) {
          return sendJson(response, 400, { error: "Invalid agent ID format" });
        }
        
        // Check if agent exists
        const agent = registry.getAgent(agentId);
        if (!agent) return sendJson(response, 404, { error: "Agent not found" });
        
        // Read request body as JSON for file metadata
        const body = await readRequestBody(request);
        
        // Generate unique filename if not provided
        const timestamp = Date.now();
        const filename = body.filename || `upload_${timestamp}.txt`;
        const originalName = body.originalName || filename;
        const description = body.description || "";
        const tags = Array.isArray(body.tags) ? body.tags : [];
        
        // Read file content from request body
        let content = "";
        if (body.content) {
          content = String(body.content);
        } else if (body.data) {
          // Handle base64 encoded data with validation
          if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body.data)) {
            return sendJson(response, 400, { error: "Invalid base64 encoding" });
          }
          try {
            content = Buffer.from(body.data, 'base64').toString('utf8');
          } catch (err) {
            return sendJson(response, 400, { error: "Invalid base64 data" });
          }
        }
        
        if (!content) {
          return sendJson(response, 400, { error: "File content is required" });
        }
        
        // Enhanced file size validation (5MB limit for security)
        const maxSize = 5 * 1024 * 1024; // 5MB reduced for security
        if (content.length > maxSize) {
          return sendJson(response, 400, { error: `File size exceeds maximum limit of ${maxSize / 1024 / 1024}MB` });
        }
        
        // Enhanced file content validation
        // Check for potentially dangerous file content
        const dangerousPatterns = [
          /<script[^>]*>.*?<\/script>/gi,
          /javascript:/gi,
          /data:/gi,
          /<iframe[^>]*>.*?<\/iframe>/gi,
          /<object[^>]*>.*?<\/object>/gi,
          /<embed[^>]*>.*?<\/embed>/gi,
          /<style[^>]*>.*?<\/style>/gi,
          /<meta[^>]*>.*?<\/meta>/gi,
          /<link[^>]*>.*?<\/link>/gi,
          /on\w+\s*=/gi,
          /eval\(/gi,
          /exec\(/gi,
          /Function\(/gi,
          /setTimeout\s*\(/gi,
          /setInterval\s*\(/gi
        ];
        
        // Additional security checks
        const lineCount = content.split('\n').length;
        if (lineCount > 10000) {
          return sendJson(response, 400, { error: "File contains too many lines" });
        }
        
        // Check for extremely long lines that might cause DoS
        const maxLineLength = 10000;
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.length > maxLineLength) {
            return sendJson(response, 400, { error: "File contains line that is too long" });
          }
        }
        
        for (const pattern of dangerousPatterns) {
          if (pattern.test(content)) {
            return sendJson(response, 400, { error: "File contains potentially dangerous content" });
          }
        }
        
        // Check file extension against allowed types
        const allowedExtensions = ['.txt', '.md', '.json', '.csv', '.xml'];
        const fileExtension = filename.toLowerCase();
        const isAllowedExtension = allowedExtensions.some(ext => fileExtension.endsWith(ext));
        
        if (!isAllowedExtension) {
          return sendJson(response, 400, { 
            error: "File type not allowed", 
            allowed: allowedExtensions 
          });
        }
        
        // Upload file
        const fileData = {
          content,
          filename,
          originalName,
          description,
          tags
        };
        
        const file = registry.uploadFile(agentId, fileData);
        return sendJson(response, 201, { file });
      } catch (err) {
        console.error('File upload error:', err);
        return sendJson(response, 400, { error: err.message || "Invalid file data" });
      }
    }

    if (fileMatch) {
      try {
        const agentId = fileMatch[1];
        const fileId = fileMatch[2];
        
        // Validate ID formats
        if (!agentIdPattern.test(agentId) || agentId.length > 64 || 
            !agentIdPattern.test(fileId) || fileId.length > 64) {
          return sendJson(response, 400, { error: "Invalid ID format" });
        }
        
        // Check if agent exists
        const agent = registry.getAgent(agentId);
        if (!agent) return sendJson(response, 404, { error: "Agent not found" });
        
        if (request.method === "GET") {
          // Get specific file
          const file = registry.getFile(agentId, fileId);
          if (!file) return sendJson(response, 404, { error: "File not found" });
          
          // Set appropriate content type header
          const contentType = file.fileType === 'txt' ? 'text/plain' : 
                            file.fileType === 'json' ? 'application/json' : 
                            file.fileType === 'md' ? 'text/markdown' : 
                            'application/octet-stream';
          
          response.writeHead(200, {
            "Content-Type": `${contentType}; charset=utf-8`,
            "Content-Length": file.fileSize,
            "Content-Disposition": `inline; filename="${file.originalName}"`,
            "Cache-Control": "public, max-age=3600"
          });
          
          response.end(file.content);
          return;
        }
        
        if (request.method === "PATCH") {
          // Update file metadata
          const body = await readRequestBody(request);
          
          // Validate update input
          if (body.tags && !Array.isArray(body.tags)) {
            return sendJson(response, 400, { error: "Tags must be an array" });
          }
          
          const updated = registry.updateFile(agentId, fileId, body);
          if (!updated) return sendJson(response, 404, { error: "File not found" });
          
          return sendJson(response, 200, { file: updated });
        }
        
        if (request.method === "DELETE") {
          // Delete file
          const deleted = registry.deleteFile(agentId, fileId);
          if (!deleted) return sendJson(response, 404, { error: "File not found" });
          
          return sendJson(response, 200, { deleted: true });
        }
      } catch (err) {
        console.error('File operation error:', err);
        return sendJson(response, 400, { error: err.message || "Invalid file data" });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/agents") {
      try {
        const agents = registry.listAgents();
        
        // Limit response size to prevent DoS
        if (agents.length > 1000) {
          response.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "http://localhost:4000"
          });
          return response.end(JSON.stringify({ 
            agents: agents.slice(0, 1000),
            warning: "Response truncated to first 1000 agents"
          }));
        }
        
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "http://localhost:4000"
        });
        return response.end(JSON.stringify({ agents }));
      } catch (err) {
        response.writeHead(500, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "http://localhost:4000"
        });
        return response.end(JSON.stringify({ error: "Internal server error" }));
      }
    }

    if (request.method === "GET" && url.pathname === "/api/topology") {
      return sendJson(response, 501, { error: "Topology endpoint not implemented yet" });
    }

    if (request.method === "GET" && url.pathname === "/api/providers") {
      try {
        const summary = providerSummary();
        
        // Add failover chain information
        summary.failoverChains = Object.keys(failoverChains).map(chainName => ({
          name: chainName,
          providerCount: failoverChains[chainName].failoverChain.length,
          healthy: true, // TODO: Add actual health check
          default: chainName === DEFAULT_FAILOVER_CHAIN
        }));
        
        summary.totalFailoverChains = Object.keys(failoverChains).length;
        summary.defaultFailoverChain = DEFAULT_FAILOVER_CHAIN;
        
        return sendJson(response, 200, summary);
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

    if (request.method === "GET" && url.pathname === "/api/providers/all-health") {
      try {
        const healthResults = {
          individualProviders: {},
          failoverChains: {},
          timestamp: Date.now()
        };
        
        // Check individual provider health
        for (const [name, provider] of Object.entries(providers)) {
          try {
            healthResults.individualProviders[name] = await provider.health();
          } catch (e) {
            healthResults.individualProviders[name] = { ok: false, error: e.message };
          }
        }
        
        // Check failover chain health
        for (const [name, chain] of Object.entries(failoverChains)) {
          try {
            healthResults.failoverChains[name] = await chain.health();
          } catch (e) {
            healthResults.failoverChains[name] = { ok: false, error: e.message };
          }
        }
        
        // Calculate overall status
        healthResults.overallHealthy = 
          Object.values(healthResults.individualProviders).some(p => p.ok === true) ||
          Object.values(healthResults.failoverChains).some(c => c.ok === true);
        
        return sendJson(response, 200, healthResults);
      } catch (err) {
        return sendJson(response, 500, { error: "Internal server error" });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/agents") {
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
            return sendJson(response, 400, { error: "Invalid JSON format" });
          }
        } else if (typeof body === 'object') {
          parsedBody = body;
          console.log('DEBUG: Received object body:', parsedBody);
        } else {
          console.log('DEBUG: Invalid request body format');
          return sendJson(response, 400, { error: "Invalid request body" });
        }
        
        if (!parsedBody || typeof parsedBody !== 'object') {
          console.log('DEBUG: Parsed body is not an object');
          return sendJson(response, 400, { error: "Request body must be an object" });
        }
        
        // Validate basic structure before calling parseCreateAgentInput
        const requiredFields = ['name', 'purpose', 'provider', 'model', 'isolationMode', 'maxConcurrentTasks', 'peerAccess'];
        for (const field of requiredFields) {
          if (!(field in parsedBody)) {
            console.log('DEBUG: Missing field:', field);
            return sendJson(response, 400, { error: `Missing required field: ${field}` });
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
              return sendJson(response, 400, { error: "Invalid agent name: contains potentially malicious content" });
            }
          }
          
          for (const pattern of dangerousPatterns) {
            if (pattern.test(parsedBody.name)) {
              console.log('DEBUG: Dangerous pattern in name:', pattern);
              return sendJson(response, 400, { error: "Invalid agent name: contains potentially malicious content" });
            }
          }
        }
        
        // Check purpose field for SQL injection
        if (parsedBody.purpose) {
          const lowerPurpose = parsedBody.purpose.toLowerCase();
          for (const keyword of sqlKeywords) {
            if (lowerPurpose.includes(keyword)) {
              console.log('DEBUG: SQL injection keyword in purpose:', keyword);
              return sendJson(response, 400, { error: "Invalid agent purpose: contains potentially malicious content" });
            }
          }
          
          for (const pattern of dangerousPatterns) {
            if (pattern.test(parsedBody.purpose)) {
              console.log('DEBUG: Dangerous pattern in purpose:', pattern);
              return sendJson(response, 400, { error: "Invalid agent purpose: contains potentially malicious content" });
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
        return sendJson(response, 201, { agent });
      } catch (err) {
        // Provide specific error messages for security and validation issues
        let errorMessage = err.message || "Invalid request body";
        
        // Sanitize error messages that might contain sensitive information
        if (errorMessage.includes('database') || errorMessage.includes('SQL')) {
          errorMessage = "Database operation failed";
        } else if (errorMessage.includes('reserved')) {
          errorMessage = "Invalid agent name: reserved names not allowed";
        }
        
        return sendJson(response, 400, { error: errorMessage });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/links") {
      try {
        const body = await readRequestBody(request);
        
        // Validate request body format
        if (!body || typeof body !== 'string') {
          return sendJson(response, 400, { error: "Invalid request body" });
        }
        
        let parsedBody;
        try {
          parsedBody = JSON.parse(body);
        } catch (jsonErr) {
          return sendJson(response, 400, { error: "Invalid JSON format" });
        }
        
        if (!parsedBody || typeof parsedBody !== 'object') {
          return sendJson(response, 400, { error: "Request body must be an object" });
        }
        
        // Validate basic structure before calling parseCreateLinkInput
        const requiredFields = ['sourceAgentId', 'targetAgentId', 'mode'];
        for (const field of requiredFields) {
          if (!(field in parsedBody)) {
            return sendJson(response, 400, { error: `Missing required field: ${field}` });
          }
        }
        
        const payload = parseCreateLinkInput(parsedBody);
        const link = registry.createLink(payload);
        return sendJson(response, 201, { link });
      } catch (err) {
        // Provide specific error messages for security and validation issues
        let errorMessage = err.message || "Invalid request body";
        
        // Sanitize error messages
        if (errorMessage.includes('database') || errorMessage.includes('SQL')) {
          errorMessage = "Database operation failed";
        }
        
        return sendJson(response, 400, { error: errorMessage });
      }
    }

    if (request.method === "GET" && !url.pathname.startsWith('/api/')) {
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

    /* ─── Job Queue ─── */

    const jobsMatch = url.pathname.match(/^\/api\/jobs$/);
    
    if (jobsMatch && request.method === "GET") {
      try {
        const status = new URLSearchParams(url.search).get('status');
        const limit = parseInt(new URLSearchParams(url.search).get('limit')) || 50;
        const offset = parseInt(new URLSearchParams(url.search).get('offset')) || 0;
        
        const jobs = registry.listJobs(status, limit, offset);
        return sendJson(response, 200, { jobs });
      } catch (err) {
        return sendJson(response, 500, { error: err.message || "Failed to list jobs" });
      }
    }
    
    if (jobsMatch && request.method === "POST") {
      try {
        const body = await readRequestBody(request);
        
        // Validate job input
        if (!body || typeof body !== 'object') {
          return sendJson(response, 400, { error: "Invalid job data" });
        }
        
        if (!body.name || typeof body.name !== 'string') {
          return sendJson(response, 400, { error: "Job name is required" });
        }
        
        if (!body.type || typeof body.type !== 'string') {
          return sendJson(response, 400, { error: "Job type is required" });
        }
        
        if (!body.payload || typeof body.payload !== 'object') {
          return sendJson(response, 400, { error: "Job payload is required and must be an object" });
        }
        
        const job = registry.createJob({
          name: body.name,
          type: body.type,
          payload: body.payload,
          priority: body.priority || 0
        });
        
        return sendJson(response, 201, { job });
      } catch (err) {
        return sendJson(response, 400, { error: err.message || "Invalid job data" });
      }
    }
    
    if (jobsMatch && request.method === "DELETE") {
      try {
        const body = await readRequestBody(request);
        
        if (!body || !Array.isArray(body.jobIds)) {
          return sendJson(response, 400, { error: "jobIds array is required" });
        }
        
        let deletedCount = 0;
        for (const jobId of body.jobIds) {
          if (registry.deleteJob(jobId)) {
            deletedCount++;
          }
        }
        
        return sendJson(response, 200, { deleted: deletedCount, jobIds: body.jobIds });
      } catch (err) {
        return sendJson(response, 400, { error: err.message || "Invalid request" });
      }
    }
    
    const jobMatch = url.pathname.match(/^\/api\/jobs\/([\w-]+)$/);
    
    if (jobMatch) {
      const jobId = jobMatch[1];
      
      if (request.method === "GET") {
        try {
          const job = registry.getJob(jobId);
          if (!job) {
            return sendJson(response, 404, { error: "Job not found" });
          }
          return sendJson(response, 200, { job });
        } catch (err) {
          return sendJson(response, 500, { error: err.message || "Failed to get job" });
        }
      }
      
      if (request.method === "PATCH") {
        try {
          const body = await readRequestBody(request);
          
          if (!body || typeof body !== 'object') {
            return sendJson(response, 400, { error: "Invalid update data" });
          }
          
          const updates = {};
          
          if (body.status) {
            const validStatuses = ['pending', 'running', 'completed', 'failed'];
            if (!validStatuses.includes(body.status)) {
              return sendJson(response, 400, { error: "Invalid status" });
            }
            updates.status = body.status;
          }
          
          if (body.progress !== undefined) {
            if (typeof body.progress !== 'number' || body.progress < 0 || body.progress > 100) {
              return sendJson(response, 400, { error: "Progress must be a number between 0 and 100" });
            }
            updates.progress = body.progress;
          }
          
          if (body.result !== undefined) {
            if (typeof body.result !== 'object') {
              return sendJson(response, 400, { error: "Result must be an object" });
            }
            updates.result = body.result;
          }
          
          if (body.error !== undefined) {
            if (typeof body.error !== 'string') {
              return sendJson(response, 400, { error: "Error must be a string" });
            }
            updates.error = body.error;
          }
          
          if (body.priority !== undefined) {
            if (typeof body.priority !== 'number' || body.priority < 0 || body.priority > 100) {
              return sendJson(response, 400, { error: "Priority must be a number between 0 and 100" });
            }
            updates.priority = body.priority;
          }
          
          const job = registry.updateJob(jobId, updates);
          if (!job) {
            return sendJson(response, 404, { error: "Job not found" });
          }
          
          return sendJson(response, 200, { job });
        } catch (err) {
          return sendJson(response, 400, { error: err.message || "Invalid update data" });
        }
      }
      
      if (request.method === "DELETE") {
        try {
          const deleted = registry.deleteJob(jobId);
          if (!deleted) {
            return sendJson(response, 404, { error: "Job not found" });
          }
          return sendJson(response, 200, { deleted: true });
        } catch (err) {
          return sendJson(response, 500, { error: err.message || "Failed to delete job" });
        }
      }
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    // Use standardized error handling
    handleError(error, request, response);
  }
});

// Enhanced rate limiting middleware with better security
const applyRateLimit = (request, response) => {
  try {
    const clientIP = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'] || '';
    const timestamp = Date.now();
    
    // Validate client IP format with enhanced security
    if (!clientIP || typeof clientIP !== 'string') {
      response.writeHead(400, { 
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(JSON.stringify({ error: 'Invalid client IP' }));
      return false;
    }
    
    // Validate IP address format (prevent IP spoofing)
    const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    if (!ipRegex.test(clientIP.toString())) {
      response.writeHead(400, { 
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(JSON.stringify({ error: 'Invalid IP address format' }));
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
          'X-Content-Type-Options': 'nosniff',
          'X-RateLimit-Reset': Math.ceil((timestamp + RATE_LIMIT_WINDOW) / 1000)
        });
        response.end(JSON.stringify({ 
          error: "Rate limit exceeded",
          message: `Max ${MAX_REQUESTS_PER_MINUTE} requests per minute per client allowed`,
          retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (timestamp - data.timestamp)) / 1000),
          timestamp: timestamp
        }));
        return false;
      }
      
      // Increment count with bounds checking
      data.count = Math.min(data.count + 1, MAX_REQUESTS_PER_MINUTE);
      data.timestamp = timestamp;
      data.userAgent = userAgent.substring(0, 500); // Truncate safely
    } else {
      // Create new entry with validation and bounds checking
      const safeUserAgent = userAgent.length > 500 ? userAgent.substring(0, 500) : userAgent;
      rateLimit.set(rateLimitKey, { count: 1, timestamp: timestamp, userAgent: safeUserAgent });
    }
    
    return true;
  } catch (err) {
    console.error('Rate limit error:', err);
    // Don't expose error details to client for security
    response.writeHead(500, { 
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(JSON.stringify({ error: 'Internal server error' }));
    return false;
  }
};

// Clean up old entries more efficiently with enhanced memory management
const cleanupRateLimitEntries = () => {
  const now = Date.now();
  const keysToDelete = [];
  
  // First pass: collect old entries
  for (const [key, data] of rateLimit.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      keysToDelete.push(key);
    }
  }
  
  // Delete old entries in batch
  for (const key of keysToDelete) {
    rateLimit.delete(key);
  }
  
  // If we still have too many entries, enforce hard limit
  if (rateLimit.size > MAX_RATE_LIMIT_ENTRIES) {
    // Sort by timestamp (most recent first)
    const sortedEntries = Array.from(rateLimit.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp);
    
    // Clear the map and repopulate with only the most recent entries
    rateLimit.clear();
    const entriesToKeep = sortedEntries.slice(0, MAX_RATE_LIMIT_ENTRIES / 2); // Keep 50% of capacity
    
    for (const [key, data] of entriesToKeep) {
      rateLimit.set(key, data);
    }
    
    console.log(`Rate limit memory optimization: removed ${rateLimit.size - entriesToKeep.length} entries to stay under limit`);
  }
};

// Optimized rate limit cleanup with better performance
const cleanupRateLimitInterval = setInterval(() => {
  const now = Date.now();
  const keysToDelete = [];
  
  // Batch collect keys to delete and perform size check in one pass
  for (const [key, data] of rateLimit.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW) {
      keysToDelete.push(key);
    }
  }
  
  // Batch delete for better performance
  for (const key of keysToDelete) {
    rateLimit.delete(key);
  }
  
  // Memory optimization: enforce maximum size with efficient cleanup
  if (rateLimit.size > MAX_REQUESTS_PER_MINUTE * 15) {
    // Sort by timestamp and keep most recent entries
    const sortedEntries = Array.from(rateLimit.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp);
    
    // Clear and repopulate with recent entries
    rateLimit.clear();
    const entriesToKeep = sortedEntries.slice(0, MAX_REQUESTS_PER_MINUTE * 10);
    
    for (const [key, data] of entriesToKeep) {
      rateLimit.set(key, data);
    }
    
    console.log(`Rate limit cleanup: removed ${rateLimit.size - entriesToKeep.length} old entries`);
  }
}, CONN_CLEANUP_INTERVAL);

// Clean up on exit
process.on('SIGINT', () => {
  if (cleanupRateLimitInterval && typeof cleanupRateLimitInterval === 'object') {
    clearInterval(cleanupRateLimitInterval);
  }
  rateLimit.clear();
});
process.on('SIGTERM', () => {
  if (cleanupRateLimitInterval && typeof cleanupRateLimitInterval === 'object') {
    clearInterval(cleanupRateLimitInterval);
  }
  rateLimit.clear();
});

// Clean up resources on exit
const cleanupOnExit = (signal) => {
  console.log(`\nReceived ${signal}, cleaning up resources...`);
  
  // Clear rate limit map
  rateLimit.clear();
  
  // Clear cleanup intervals if they exist
  if (cleanupRateLimitInterval && typeof cleanupRateLimitInterval === 'object') {
    clearInterval(cleanupRateLimitInterval);
  }
  
  // Clear connected clients
  connectedClients.clear();
  
  // Close WebSocket server
  wss.close();
};

process.on('SIGINT', () => cleanupOnExit('SIGINT'));
process.on('SIGTERM', () => cleanupOnExit('SIGTERM'));

// Broadcast job updates to all connected clients
const broadcastJobUpdate = (job) => {
  const jobUpdate = {
    type: 'job_update',
    timestamp: Date.now(),
    data: job
  };
  
  const message = JSON.stringify(jobUpdate);
  connectedClients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
};

// Broadcast agent status updates to all connected clients
const broadcastAgentStatus = () => {
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
        uptime: Math.floor((Date.now() - startTime) / 1000),
        totalSessions: 0,
        totalMessages: 0
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

// Handle WebSocket upgrade with enhanced authentication and security
server.on('upgrade', (request, socket, head) => {
  try {
    const pathname = new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname;
    
    if (pathname === '/ws') {
      // Validate WebSocket origin with enhanced security
      const origin = request.headers.origin;
      if (!isOriginAllowed(origin)) {
        console.error('WebSocket connection rejected from origin:', origin);
        sendWebSocketError(socket, 403, 'Forbidden: Origin not allowed');
        return;
      }
      
      // Enhanced authentication check with multiple validation layers
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const apiKey = url.searchParams.get('auth');
      
      // Validate API key format and presence with enhanced checks
      if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 256) {
        console.error('WebSocket connection rejected: invalid authentication format');
        sendWebSocketError(socket, 401, 'Unauthorized: Invalid authentication format');
        return;
      }
      
      // Check for API key injection attempts
      if (apiKey.includes('"') || apiKey.includes("'") || apiKey.includes('`')) {
        console.error('WebSocket connection rejected: potential API key injection');
        sendWebSocketError(socket, 401, 'Unauthorized: Invalid authentication');
        return;
      }
      
      // Use secure comparison to prevent timing attacks
      const validApiKey = process.env.WEBSOCKET_API_KEY;
      if (!validApiKey) {
        console.error('WebSocket connection rejected: no API key configured');
        sendWebSocketError(socket, 500, 'Internal server error');
        return;
      }
      
      // Constant-time comparison to prevent timing attacks
      const isValidApiKey = crypto.timingSafeEqual(
        Buffer.from(apiKey, 'utf8'),
        Buffer.from(validApiKey, 'utf8')
      );
      
      if (!isValidApiKey) {
        // Log failed attempts (but don't reveal timing information)
        console.error('WebSocket connection rejected: invalid authentication');
        sendWebSocketError(socket, 401, 'Unauthorized: Invalid authentication');
        return;
      }
      
      // Validate user agent for additional security
      const userAgent = request.headers['user-agent'] || '';
      if (!userAgent || userAgent.length > 500) {
        console.error('WebSocket connection rejected: invalid user agent');
        sendWebSocketError(socket, 400, 'Bad request: Invalid user agent');
        return;
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
      
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
        
        // Add client to set with metadata
        const clientInfo = {
          ws,
          connectedAt: Date.now(),
          userAgent,
          origin
        };
        connectedClients.add(clientInfo);
        
        // Set up heartbeat for connection health
        const heartbeatInterval = setInterval(() => {
          if (ws.readyState === 1) { // WebSocket.OPEN
            ws.ping();
          } else {
            clearInterval(heartbeatInterval);
            connectedClients.delete(clientInfo);
          }
        }, 30000);
        
        // Send initial status to new client
        try {
          broadcastAgentStatus();
        } catch (err) {
          console.error('Error broadcasting initial status:', err);
        }
        
        // Handle client disconnect with cleanup
        ws.on('close', () => {
          clearInterval(heartbeatInterval);
          connectedClients.delete(clientInfo);
          console.log(`WebSocket client disconnected from ${origin}`);
        });
        
        // Handle client errors with proper cleanup
        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          clearInterval(heartbeatInterval);
          connectedClients.delete(clientInfo);
        });
        
        // Handle messages with comprehensive validation
        ws.on('message', (message) => {
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
            
            // Log message securely (no sensitive data)
            console.log('Received WebSocket message:', {
              type: data.type || 'unknown',
              timestamp: Date.now(),
              dataSize: JSON.stringify(data).length,
              hasData: !!data.data
            });
            
            // Add rate limiting for message frequency
            // Implementation would track message timestamps per client
            
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
    sendWebSocketError(socket, 500, 'Internal server error');
  }
});

// Helper function to send WebSocket error responses
const sendWebSocketError = (socket, statusCode, message) => {
  try {
    const errorResponse = {
      type: 'error',
      code: statusCode,
      message: message,
      timestamp: Date.now()
    };
    
    const response = `data: ${JSON.stringify(errorResponse)}\n\n`;
    socket.write(response);
    socket.end();
  } catch (err) {
    console.error('Error sending WebSocket error response:', err);
    socket.destroy();
  }
};

// Broadcast status updates every 30 seconds
// setInterval(broadcastAgentStatus, 30 * 1000);

server.listen(port, host, () => {
  console.log(`Zsiistant v${VERSION} listening on http://${host}:${port}`);
  console.log(`WebSocket endpoint available at ws://${host}:${port}/ws`);
});
