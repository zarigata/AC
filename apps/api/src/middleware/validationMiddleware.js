/**
 * Request Validation Middleware - Zod-based schema validation for all POST/PUT routes
 */

import { z } from "zod";

// Enhanced security validation functions
const sanitizeInput = (input, fieldName) => {
  if (typeof input !== 'string') return input;
  
  // Remove potentially dangerous characters
  let sanitized = input
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ').trim(); // Normalize whitespace
  
  // Check for dangerous patterns
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
    /;\s*--/g,
    /\b(union|select|insert|update|delete|drop|create|alter)\b/gi
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(sanitized)) {
      throw new Error(`Invalid ${fieldName}: contains potentially dangerous content`);
    }
  }
  
  return sanitized;
};

// Enhanced string validation with security checks
const secureString = (min, max, fieldName) => 
  z.string().min(min).max(max).transform(val => sanitizeInput(val, fieldName));

// Agent schemas
const createAgentSchema = z.object({
  name: secureString(2, 80, "name"),
  purpose: secureString(10, 240, "purpose"),
  provider: secureString(2, 80, "provider"),
  model: secureString(2, 120, "model"),
  isolationMode: z.enum(["isolated", "selective", "mesh"]).optional().default("isolated"),
  maxConcurrentTasks: z.number().min(1).max(32).optional().default(4),
  peerAccess: z.boolean().optional().default(false),
  // Optional fields for backward compatibility
  description: z.string().max(500).optional().nullable().transform(val => val ? sanitizeInput(val, "description") : val),
  systemPrompt: z.string().max(2000).optional().nullable().transform(val => val ? sanitizeInput(val, "systemPrompt") : val),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(32000).optional(),
  enabled: z.boolean().optional(),
  tools: z.array(z.string()).optional(),
});

const updateAgentSchema = z.object({
  name: secureString(2, 80, "name").optional(),
  purpose: secureString(10, 240, "purpose").optional(),
  provider: secureString(2, 80, "provider").optional(),
  model: secureString(2, 120, "model").optional(),
  isolationMode: z.enum(["strict", "moderate", "lenient"]).optional(),
  maxConcurrentTasks: z.number().min(1).max(32).optional(),
  peerAccess: z.boolean().optional(),
  // Optional fields for backward compatibility
  description: z.string().max(500).optional().nullable().transform(val => val ? sanitizeInput(val, "description") : val),
  systemPrompt: z.string().max(2000).optional().nullable().transform(val => val ? sanitizeInput(val, "systemPrompt") : val),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(32000).optional(),
  enabled: z.boolean().optional(),
  tools: z.array(z.string()).optional(),
});

// Chat schemas
const sendMessageSchema = z.object({
  message: z.string().min(1).max(16000).transform(val => sanitizeInput(val, "message")),
  sessionId: z.string().min(1).max(100).optional().transform(val => val ? sanitizeInput(val, "sessionId") : val),
  stream: z.boolean().optional().default(false),
  tools: z.array(z.string()).optional().default([]),
});

const createChatSessionSchema = z.object({
  agentId: z.string().min(1).max(100).transform(val => sanitizeInput(val, "agentId")),
  initialMessage: z.string().optional().transform(val => val ? sanitizeInput(val, "initialMessage") : val),
  metadata: z.record(z.any()).optional(),
});

// Settings schemas
const updateSettingsSchema = z.object({
  model: z.string().min(1).max(50).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(32000).optional(),
  systemPrompt: z.string().optional().nullable(),
  enabledTools: z.array(z.string()).optional(),
  defaultProvider: z.string().min(1).max(50).optional(),
});

// Link schemas
const createLinkSchema = z.object({
  sourceAgentId: secureString(2, 64, "sourceAgentId"),
  targetAgentId: secureString(2, 64, "targetAgentId"),
  mode: z.enum(["observe", "message", "delegate"]).optional().default("observe"),
  direction: z.enum(["inbound", "outbound", "bidirectional"]).optional().default("outbound"),
  enabled: z.boolean().optional().default(true),
  metadata: z.record(z.any()).optional(),
});

// Provider schemas
const createProviderSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["ollama", "ollama-cloud", "zai", "anthropic", "openai"]),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  model: z.string().min(1).max(100),
  enabled: z.boolean().optional().default(true),
  priority: z.number().min(1).max(10).optional().default(1),
});

const updateProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(["ollama", "ollama-cloud", "zai", "anthropic", "openai"]).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  model: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().min(1).max(10).optional(),
});

// General request schema
const requestSchema = z.object({
  body: z.any().optional(),
  params: z.record(z.string(), z.any()).optional(),
  query: z.record(z.string(), z.any()).optional(),
});

/**
 * Read request body helper
 * @param {object} request - HTTP request object
 * @returns {Promise<object>} - Parsed request body
 */
const readRequestBody = async (request) => {
  // If body is already parsed (by middleware), use it
  if (request.body && typeof request.body === 'object') {
    return request.body;
  }
  
  // Otherwise, parse raw request body
  return new Promise((resolve, reject) => {
    let body = '';
    
    request.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    request.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        request.body = parsed; // Cache the parsed body
        resolve(parsed);
      } catch (error) {
        reject(new Error('Invalid JSON format'));
      }
    });
    
    request.on('error', (error) => {
      reject(error);
    });
  });
};

/**
 * Validation middleware factory
 * @param {string} method - HTTP method (POST, PUT, etc.)
 * @param {string} route - Route pattern
 * @param {object} schema - Zod schema to validate
 * @returns {Function} Express-style middleware
 */
export const validateRequest = (method, route, schema) => {
  return async (request, response, next) => {
    try {
      // Only validate for the specified method
      if (request.method !== method.toUpperCase()) {
        return next();
      }

      // Read and parse request body if not already parsed
      if (!request.body && request.method !== 'GET') {
        request.body = await readRequestBody(request);
      }

      // Extract route parameters if needed
      const requestData = {
        body: request.body || {},
        params: request.params || {},
        query: request.query || {},
      };

      // Validate against schema
      const validatedData = await schema.parseAsync(requestData);
      
      // Replace request data with validated data
      request.body = validatedData.body;
      request.params = validatedData.params;
      request.query = validatedData.query;
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorDetails = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({
          error: "Validation failed",
          details: errorDetails,
          message: "The request contains invalid or missing data fields.",
        }));
      } else {
        next(error);
      }
    }
  };
};

/**
 * Route-specific validation middleware exports
 */
export const validateCreateAgent = (request, response, next) => {
  return validateRequest('POST', '/api/agents', createAgentSchema)(request, response, next);
};

export const validateUpdateAgent = (request, response, next) => {
  return validateRequest('PUT', '/api/agents/:id', updateAgentSchema)(request, response, next);
};

export const validateSendMessage = (request, response, next) => {
  return validateRequest('POST', '/api/chat/send', sendMessageSchema)(request, response, next);
};

export const validateCreateChatSession = (request, response, next) => {
  return validateRequest('POST', '/api/chat/sessions', createChatSessionSchema)(request, response, next);
};

export const validateUpdateSettings = (request, response, next) => {
  return validateRequest('PUT', '/api/settings', updateSettingsSchema)(request, response, next);
};

// Export schemas for direct use in route handlers
export { createAgentSchema, updateAgentSchema, createLinkSchema };

export const validateCreateProvider = (request, response, next) => {
  return validateRequest('POST', '/api/providers', createProviderSchema)(request, response, next);
};

export const validateUpdateProvider = (request, response, next) => {
  return validateRequest('PUT', '/api/providers/:id', updateProviderSchema)(request, response, next);
};

export const validateCreateLink = (request, response, next) => {
  return validateRequest('POST', '/api/links', createLinkSchema)(request, response, next);
};

/**
 * General validation middleware for any POST/PUT route
 */
export const validatePostPut = (request, response, next) => {
  if (!['POST', 'PUT'].includes(request.method.toUpperCase())) {
    return next();
  }

  // Use a basic schema for all POST/PUT requests
  const basicSchema = z.object({
    body: z.record(z.any()).optional(),
    params: z.record(z.string(), z.any()).optional(),
    query: z.record(z.string(), z.any()).optional(),
  });

  // Use the validateRequest function with proper async handling
  return validateRequest(request.method, '/', basicSchema)(request, response, next);
};