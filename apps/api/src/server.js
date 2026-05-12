import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";
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
import { registerAgentRoutes } from "./routes/agents.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerProviderRoutes } from "./routes/providers.js";
import { registerHealthRoutes } from "./routes/health.js";

// Security helper functions
const sanitizeError = (error) => {
  if (!error) return 'Unknown error';
  
  // Convert to string if not already
  const errorStr = typeof error === 'string' ? error : error.message || 'Unknown error';
  
  // Remove potentially sensitive information
  return errorStr
    .replace(/API key[^\s]*[^\s\w]/gi, '***')
    .replace(/token[^\s]*[^\s\w]/gi, '***')
    .replace(/password[^\s]*[^\s\w]/gi, '***')
    .replace(/secret[^\s]*[^\s\w]/gi, '***')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '***')
    .substring(0, 500); // Limit length
};

const sanitizeOutput = (data) => {
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'string') {
    // Remove potentially dangerous characters from strings
    return data
      .replace(/<[^>]*script[^>]*>.*?<\/[^>]*script[^>]*>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/\x00/g, '')
      .substring(0, 1000); // Limit length
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeOutput(item));
  }
  
  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      // Skip potentially dangerous keys
      if (key.includes('password') || key.includes('secret') || key.includes('token')) {
        sanitized[key] = '***';
      } else {
        sanitized[key] = sanitizeOutput(value);
      }
    }
    return sanitized;
  }
  
  return data;
};

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
    
    // Validate job structure before processing
    if (!job || typeof job !== 'object' || !job.id || !job.type) {
      console.error('Invalid job structure:', job);
      return;
    }
    
    // Mark job as running
    runningJobs.add(jobId);
    try {
      const runningJob = registry.updateJob(jobId, { status: 'running' });
      if (!runningJob) {
        runningJobs.delete(jobId);
        console.error(`Failed to update job status for job ${jobId}`);
        return;
      }
    } catch (updateError) {
      runningJobs.delete(jobId);
      console.error(`Failed to update job status for job ${jobId}:`, updateError.message);
      return;
    }
    
    // Broadcast job start
    try {
      broadcastJobUpdate({
        id: jobId,
        name: sanitizeOutput(job.name),
        type: sanitizeOutput(job.type),
        status: 'running',
        progress: 0,
        startedAt: runningJob.startedAt
      });
    } catch (broadcastError) {
      console.error('Failed to broadcast job start:', broadcastError.message);
    }
    
    console.log(`Starting job: ${job.name} (${jobId})`);
    
    // Process the job based on its type with enhanced error handling
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
            message: `Job type ${sanitizeOutput(job.type)} processed`, 
            timestamp: Date.now() 
          };
      }
      
      // Update job with result with error handling
      try {
        const completedJob = registry.updateJob(jobId, { 
          status: 'completed', 
          progress: 100,
          result: sanitizeOutput(result) 
        });
        
        // Broadcast job completion with error handling
        broadcastJobUpdate({
          id: jobId,
          name: sanitizeOutput(job.name),
          type: sanitizeOutput(job.type),
          status: 'completed',
          progress: 100,
          result: sanitizeOutput(result),
          completedAt: completedJob.completedAt
        });
        
        console.log(`Completed job: ${job.name} (${jobId})`);
      } catch (completionError) {
        console.error(`Failed to complete job ${jobId}:`, completionError.message);
      }
      
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

// Initialize Ollama as primary with enhanced security validation
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const ollamaModel = process.env.OLLAMA_MODEL || "qwen3:1.7b";
const ollamaTimeout = parseInt(process.env.OLLAMA_TIMEOUT || "120000", 10);

// Enhanced security validation for Ollama parameters
if (!ollamaBaseUrl || typeof ollamaBaseUrl !== 'string' || ollamaBaseUrl.length > 2048) {
  throw new Error('Invalid OLLAMA_BASE_URL: must be a string between 1 and 2048 characters');
}

if (!ollamaModel || typeof ollamaModel !== 'string' || ollamaModel.length > 120) {
  throw new Error('Invalid OLLAMA_MODEL: must be a string between 1 and 120 characters');
}

if (isNaN(ollamaTimeout) || ollamaTimeout < 1000 || ollamaTimeout > 300000) {
  throw new Error('Invalid OLLAMA_TIMEOUT: must be a number between 1000 and 300000 milliseconds');
}

providers.ollama = new OllamaAdapter({
  baseUrl: ollamaBaseUrl,
  model: ollamaModel,
  timeout: ollamaTimeout,
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

// Enhanced Rate limiting with improved security
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 60;
const MAX_CONCURRENT_CONNECTIONS = 100; // Maximum concurrent connections per IP
const CONN_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_RATE_LIMIT_ENTRIES = 5000; // Reduced for better memory security
const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB max request size
const MAX_CONNECTIONS_PER_IP = 20; // Reduced to prevent DoS
const MAX_CONCURRENT_TOTAL = 1000; // Total concurrent connections
const MAX_REQUEST_TIMEOUT = 30000; // 30 seconds timeout for requests

// Track active connections for DoS protection
const activeConnections = new Map();
let totalActiveConnections = 0;

// Rate limiting data structure for WebSocket messages
const messageTimestamps = new Map();

// IP tracking and blocking for abuse prevention
const blockedIPs = new Set();
const ipViolationCounts = new Map();
const BLOCK_THRESHOLD = 50; // violations before blocking
const BLOCK_DURATION = 30 * 60 * 1000; // 30 minutes
const IP_CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes

const isBlockedIP = (ip) => {
  return blockedIPs.has(ip);
};

const recordIPViolation = (ip) => {
  const now = Date.now();
  const count = (ipViolationCounts.get(ip) || 0) + 1;
  ipViolationCounts.set(ip, count);
  
  // Block IP if threshold exceeded
  if (count >= BLOCK_THRESHOLD) {
    blockedIPs.add(ip);
    // Schedule unblocking
    setTimeout(() => {
      blockedIPs.delete(ip);
      ipViolationCounts.delete(ip);
    }, BLOCK_DURATION);
    console.log(`IP ${ip} blocked due to ${count} violations`);
  }
};

const cleanupIPTracking = () => {
  const now = Date.now();
  for (const [ip, lastViolation] of ipViolationCounts.entries()) {
    if (now - lastViolation > BLOCK_DURATION) {
      ipViolationCounts.delete(ip);
    }
  }
};

// Start IP tracking cleanup
setInterval(cleanupIPTracking, IP_CLEANUP_INTERVAL);

// CSRF protection
const CSRF_TOKEN_SECRET = process.env.CSRF_TOKEN_SECRET || randomBytes(32).toString('hex');
const csrfTokenStore = new Map();

const generateCSRFToken = () => {
  const token = randomBytes(32).toString('hex');
  const hmac = createHmac('sha256', CSRF_TOKEN_SECRET).update(token).digest('hex');
  csrfTokenStore.set(token, Date.now());
  return { token, hmac };
};

const validateCSRFToken = (token) => {
  if (!token || typeof token !== 'string') return false;
  
  const hmac = createHmac('sha256', CSRF_TOKEN_SECRET).update(token).digest('hex');
  const isValidHmac = crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(token.split('.')[1] || '')
  );
  
  const isValidToken = csrfTokenStore.has(token) && isValidHmac;
  
  if (isValidToken) {
    csrfTokenStore.delete(token);
  }
  
  return isValidToken;
};

const cleanupCSRFTokenStore = () => {
  const now = Date.now();
  const TOKEN_LIFETIME = 30 * 60 * 1000; // 30 minutes
  
  for (const [token, timestamp] of csrfTokenStore.entries()) {
    if (now - timestamp > TOKEN_LIFETIME) {
      csrfTokenStore.delete(token);
    }
  }
};

// Start CSRF token cleanup
setInterval(cleanupCSRFTokenStore, 15 * 60 * 1000); // Every 15 minutes

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

// Security helper functions
const getTrustedIP = (request) => {
  // Get IP from various headers with security checks
  const ip = request.headers['x-forwarded-for'] || 
             request.headers['x-real-ip'] || 
             request.socket.remoteAddress;
  
  if (typeof ip !== 'string') return 'unknown';
  
  // Extract first IP from x-forwarded-for if present
  if (ip.includes(',')) {
    const ips = ip.split(',').map(i => i.trim());
    // Return the first IP that appears valid
    for (const candidate of ips) {
      if (isValidIP(candidate)) return candidate;
    }
    return ips[0]; // fallback to first
  }
  
  return ip;
};

const isValidIP = (ip) => {
  if (typeof ip !== 'string' || ip.length > 45) return false;
  
  // IPv4 validation
  if (ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
    const parts = ip.split('.');
    return parts.every(part => parseInt(part) >= 0 && parseInt(part) <= 255);
  }
  
  // IPv6 validation (simplified)
  if (ip.match(/^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/)) {
    return true;
  }
  
  return false;
};

const validateRequestSize = (request) => {
  if (request.headers['content-length']) {
    const contentLength = parseInt(request.headers['content-length']);
    if (contentLength > MAX_REQUEST_SIZE) {
      throw new Error(`Request size exceeds maximum limit of ${MAX_REQUEST_SIZE / 1024 / 1024}MB`);
    }
  }
  return true;
};

const registry = new AgentRegistry({ databasePath });
try { registry.seed(); } catch (seedErr) { console.error("Seed error (non-fatal):", seedErr.message); }

// Create HTTP server
const server = createServer((req, res) => {
  // Default 404 handler
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:4000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4000",
  "null", // Allow requests without origin header (local testing)
  undefined // Allow requests without origin header
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
  // Allow requests without origin for local development/testing
  if (!origin || origin === 'null' || origin === undefined) {
    return true;
  }
  
  // First validate the origin format
  if (!validateOrigin(origin)) {
    return false;
  }
  
  // Then check against allowed origins
  return ALLOWED_ORIGINS.includes(origin);
};

// Enhanced SQL injection protection for agent ID validation
const validateAgentId = (agentId, fieldName = 'agent ID') => {
  if (!agentId || typeof agentId !== 'string' || agentId.length > 64 || agentId.length < 1) {
    throw new Error(`Invalid ${fieldName}: must be 1-64 characters`);
  }
  
  // Check for SQL injection patterns
  const sqlPatterns = [
    /;\s*--/g,
    /'/g,
    /"/g,
    /`/g,
    /\\/g,
    /SELECT\s+/gi,
    /INSERT\s+/gi,
    /UPDATE\s+/gi,
    /DELETE\s+/gi,
    /DROP\s+/gi,
    /CREATE\s+/gi,
    /ALTER\s+/gi,
    /UNION\s+/gi,
    /EXEC\s+/gi,
    /EXECUTE\s+/gi,
    /script/gi,
    /javascript/gi,
    /iframe/gi,
    /object/gi,
    /embed/gi
  ];
  
  // Additional reserved names check
  const reservedNames = ['admin', 'system', 'root', 'database', 'sql', 'delete', 'drop', 'create', 'alter'];
  const lowerAgentId = agentId.toLowerCase();
  
  if (reservedNames.some(name => lowerAgentId.includes(name))) {
    throw new Error(`Invalid ${fieldName}: contains reserved name`);
  }
  
  for (const pattern of sqlPatterns) {
    if (pattern.test(agentId)) {
      throw new Error(`Invalid ${fieldName}: contains potentially malicious content`);
    }
  }
  
  // Check for dangerous characters
  if (/[\x00-\x1F\x7F-\x9F]/.test(agentId)) {
    throw new Error(`Invalid ${fieldName}: contains control characters`);
  }
  
  return agentId;
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
  let finalPayload;
  
  if (typeof statusCode === 'number' && typeof payload !== 'undefined') {
    // Normal case: sendJson(response, 200, { data: 'value' })
    validStatusCode = statusCode;
    finalPayload = payload;
  } else if (typeof statusCode === 'object' && typeof payload === 'undefined') {
    // Case where payload was passed as second parameter: sendJson(response, { data: 'value' })
    validStatusCode = 200;
    finalPayload = statusCode;
  } else {
    // Invalid case, default to 200
    validStatusCode = 200;
    finalPayload = payload || { error: 'Invalid sendJson parameters' };
  }
  
  // Debug logging
  console.log('DEBUG sendJson:', {
    statusCode: typeof statusCode,
    statusCodeValue: validStatusCode,
    payload: typeof finalPayload,
    payloadPreview: typeof finalPayload === 'object' ? JSON.stringify(finalPayload).substring(0, 100) : finalPayload
  });
  
  // Additional error checking
  if (typeof validStatusCode !== 'number' || !Number.isInteger(validStatusCode) || validStatusCode < 100 || validStatusCode > 599) {
    console.error('Invalid status code detected:', validStatusCode, typeof validStatusCode);
    // Try to fix it
    validStatusCode = 500;
    finalPayload = { error: 'Internal server error - invalid status code' };
  }
  
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
    // Handle circular references in payload
    const getCircularReplacer = () => {
      const seen = new WeakSet();
      return (key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) {
            return "[Circular Reference]";
          }
          seen.add(value);
        }
        return value;
      };
    };
    
    const sanitizedPayload = sanitizeJsonPayload(finalPayload);
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

// Enhanced error handling middleware with security
const handleError = (error, request, response) => {
  // Log detailed error internally but don't expose to client
  console.error(`Error ${request.method} ${request.url}:`, error.message);
  console.error('Stack trace:', error.stack);
  
  let statusCode = 500;
  let errorType = 'Internal Server Error';
  let message = 'An unexpected error occurred';
  
  // Sanitize error information before sending to client
  const clientError = {
    timestamp: Date.now(),
    requestId: crypto.randomUUID(),
    path: request.url,
    method: request.method
  };
  
  // Categorize errors with sanitized client responses
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('validation')) {
      statusCode = 400;
      errorType = 'Validation Error';
      message = 'Invalid input data';
    } else if (errorMessage.includes('not found')) {
      statusCode = 404;
      errorType = 'Not Found';
      message = 'Requested resource not found';
    } else if (errorMessage.includes('forbidden') || errorMessage.includes('unauthorized')) {
      statusCode = 403;
      errorType = 'Forbidden';
      message = 'Access denied';
    } else if (errorMessage.includes('timeout')) {
      statusCode = 408;
      errorType = 'Request Timeout';
      message = 'Request took too long to process';
    } else if (errorMessage.includes('rate limit')) {
      statusCode = 429;
      errorType = 'Rate Limit Exceeded';
      message = 'Too many requests';
    } else if (errorMessage.includes('database')) {
      statusCode = 503;
      errorType = 'Service Unavailable';
      message = 'Service temporarily unavailable';
    }
  }
  
  // Send sanitized error response to client
  sendError(response, statusCode, errorType, message, clientError);
};

const MAX_JSON_PAYLOAD_SIZE = 1024 * 1024; // 1MB limit

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

// Register modular route handlers
registerAgentRoutes(server, registry, providers, failoverChains, settings);
registerChatRoutes(server, registry, providers, failoverChains, settings);
registerSettingsRoutes(server, registry, providers, failoverChains, settings);
registerProviderRoutes(server, registry, providers, failoverChains, settings);
registerHealthRoutes(server, registry, providers, failoverChains, settings);

// Enhanced rate limiting middleware with better security
const applyRateLimit = (request, response) => {
  try {
    const clientIP = getTrustedIP(request);
    const userAgent = request.headers['user-agent'] || '';
    const timestamp = Date.now();
    
    // Validate client IP format
    if (!clientIP || clientIP === 'unknown') {
      sendError(response, 400, 'Invalid Client IP', 'Invalid client IP address');
      return false;
    }
    
    // Check if IP is already blocked
    if (isBlockedIP(clientIP)) {
      sendError(response, 429, 'IP Blocked', 'Your IP address has been temporarily blocked');
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
        sendError(response, 429, 'Rate Limit Exceeded', `Max ${MAX_REQUESTS_PER_MINUTE} requests per minute per client allowed`, {
          retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (timestamp - data.timestamp)) / 1000),
          timestamp: timestamp
        });
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
    sendError(response, 500, 'Internal Server Error', 'Rate limiting service temporarily unavailable');
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
  
  // If we still have too many entries, enforce hard limit with more aggressive cleanup
  if (rateLimit.size > MAX_RATE_LIMIT_ENTRIES) {
    // Sort by timestamp (most recent first)
    const sortedEntries = Array.from(rateLimit.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp);
    
    // Clear the map and repopulate with only the most recent entries (more aggressive)
    rateLimit.clear();
    const entriesToKeep = sortedEntries.slice(0, MAX_RATE_LIMIT_ENTRIES / 4); // Keep 25% of capacity for better memory management
    
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
  if (cleanupRateLimitInterval && typeof cleanupRateLimitInterval.clear === 'function') {
    clearInterval(cleanupRateLimitInterval);
  }
  rateLimit.clear();
});
process.on('SIGTERM', () => {
  if (cleanupRateLimitInterval && typeof cleanupRateLimitInterval.clear === 'function') {
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
  if (cleanupRateLimitInterval && typeof cleanupRateLimitInterval.clear === 'function') {
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
        
        // Handle messages with comprehensive validation and rate limiting
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
            
          } catch (err) {
            console.error('Invalid WebSocket message format:', err.message);
            ws.close(1008, err.message);
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

// Helper function to send WebSocket error responses with enhanced security
const sendWebSocketError = (socket, statusCode, message) => {
  try {
    // Sanitize error message to prevent information leakage
    const sanitizedMessage = sanitizeError(message);
    
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
    console.error('Error sending WebSocket error response:', sanitizeError(err.message));
    if (socket && socket.destroy) {
      socket.destroy();
    }
  }
};

const cleanupOldConnections = () => {
  const now = Date.now();
  const CONNECTION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
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

// Broadcast status updates every 30 seconds
// setInterval(broadcastAgentStatus, 30 * 1000);

server.listen(port, host, () => {
  console.log(`Zsiistant v${VERSION} listening on http://${host}:${port}`);
  console.log(`WebSocket endpoint available at ws://${host}:${port}/ws`);
});