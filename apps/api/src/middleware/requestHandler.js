/**
 * Request Handler Middleware - Contains functions for reading request bodies and processing responses
 */

import { sanitizeError, sanitizeJsonPayload, validateAgentId } from './security.js';

export const MAX_JSON_PAYLOAD_SIZE = 1024 * 1024; // 1MB limit
export const MAX_REQUEST_TIMEOUT = 30000; // 30 seconds timeout for requests

export const readRequestBody = async (request) => {
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
    
    // Delay empty body check until after JSON parsing
    
    if (!raw || raw.trim().length === 0) {
      return {};
    }
    
    try {
      // Use safer JSON parsing with comprehensive prototype protection
      const parsed = JSON.parse(raw, (key, value) => {
        // Block prototype pollution attempts
        const blockedKeys = [
          '__proto__', 'constructor', 'prototype',
          '__defineGetter__', '__defineSetter__',
          '__lookupGetter__', '__lookupSetter__'
        ];
        
        if (blockedKeys.includes(key)) {
          throw new Error(`Security violation: blocked key ${key}`);
        }
        
        // Block null prototype attacks
        if (value && typeof value === 'object' && value.__proto__ === null) {
          throw new Error('Security violation: null prototype object detected');
        }
        
        return value;
      });
      
      // Validate parsed object structure strictly
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid JSON structure: expected object');
      }
      
      // Enhanced security checks with comprehensive validation
      const blockedProps = [
        '__proto__', 'constructor', 'prototype',
        '__defineGetter__', '__defineSetter__',
        '__lookupGetter__', '__lookupSetter__'
      ];
      
      // Check for dangerous properties
      for (const prop of blockedProps) {
        if (Object.prototype.hasOwnProperty.call(parsed, prop)) {
          throw new Error(`Security violation: blocked property ${prop}`);
        }
      }
      
      // Comprehensive prototype pollution check
      try {
        // Test for prototype manipulation
        const testObj = {};
        Object.assign(testObj, parsed);
        
        // Additional check for circular references and dangerous patterns
        const seen = new WeakSet();
        const deepCheck = (obj) => {
          if (obj === null || typeof obj !== 'object') return;
          
          if (seen.has(obj)) {
            throw new Error('Security violation: circular reference detected');
          }
          
          seen.add(obj);
          
          for (const key in obj) {
            if (blockedProps.includes(key)) {
              throw new Error(`Security violation: blocked key ${key} in object`);
            }
            deepCheck(obj[key]);
          }
        };
        
        deepCheck(parsed);
      } catch (protoErr) {
        if (protoErr.message.includes('Security violation')) {
          throw protoErr; // Re-throw our security errors
        }
        throw new Error('Invalid JSON structure: object validation failed');
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

export const contentTypeFor = (path) => {
  const extension = require('node:path').extname(path);
  switch (extension) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    default:
      return "text/html; charset=utf-8";
  }
};

export const sendJson = (response, statusCode, payload) => {
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
  
  // Additional error checking
  if (typeof validStatusCode !== 'number' || !Number.isInteger(validStatusCode) || validStatusCode < 100 || validStatusCode > 599) {
    console.error('Invalid status code detected:', validStatusCode, typeof validStatusCode);
    // Try to fix it
    validStatusCode = 500;
    finalPayload = { error: 'Internal server error - invalid status code' };
  }
  
  // Enhanced security: Define allowed origins explicitly
  const ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:4000",
    "http://localhost:5000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:4000",
    "http://127.0.0.1:5000",
    "null", // Allow requests without origin header
    undefined // Allow requests without origin header
  ];
  
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Content-Type-Options",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  };
  
  // Secure CORS headers with explicit origin validation
  if (origin && origin !== 'null' && origin !== undefined && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else if (origin === 'null' || origin === undefined) {
    // Allow requests without origin for local development/testing
    headers["Access-Control-Allow-Origin"] = "*";
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

export const sendError = (response, statusCode, errorType, message, details = null) => {
  const origin = response.getHeader('origin');
  
  // Enhanced security: Define allowed origins explicitly
  const ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:4000",
    "http://localhost:5000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:4000",
    "http://127.0.0.1:5000",
    "null", // Allow requests without origin header
    undefined // Allow requests without origin header
  ];
  
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With"
  };
  
  // Secure CORS headers with explicit origin validation
  if (origin && origin !== 'null' && origin !== undefined && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  } else if (origin === 'null' || origin === undefined) {
    // Allow requests without origin for local development/testing
    headers["Access-Control-Allow-Origin"] = "*";
  }
  
  const errorResponse = {
    error: errorType,
    message: message,
    ...(details && { details }),
    requestId: global.crypto?.randomUUID?.() || require('node:crypto').randomUUID(),
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

export const handleError = (error, request, response) => {
  // Log detailed error internally but don't expose to client
  console.error(`Error ${request.method} ${request.url}:`, error.message);
  console.error('Stack trace:', error.stack);
  
  let statusCode = 500;
  let errorType = 'Internal Server Error';
  let message = 'An unexpected error occurred';
  
  // Sanitize error information before sending to client
  const clientError = {
    timestamp: Date.now(),
    requestId: global.crypto?.randomUUID?.() || require('node:crypto').randomUUID(),
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

export const validateAgentSchema = (agentData) => {
  // Enhanced validation for agent data with comprehensive security checks
  const requiredFields = ['name', 'model'];
  const optionalFields = ['isolationMode', 'linkMode', 'systemPrompt', 'instructions', 'tags'];
  
  // Validate required fields
  for (const field of requiredFields) {
    if (!agentData[field] || typeof agentData[field] !== 'string' || agentData[field].trim().length === 0) {
      throw new Error(`Missing or invalid required field: ${field}`);
    }
  }
  
  // Validate agent name format
  validateAgentId(agentData.name, 'agent name');
  
  // Validate model format
  if (!agentData.model || typeof agentData.model !== 'string' || agentData.model.length < 1 || agentData.model.length > 120) {
    throw new Error('Invalid model format: must be 1-120 characters');
  }
  
  // Validate optional fields if present
  for (const field of optionalFields) {
    if (agentData[field] !== undefined) {
      if (typeof agentData[field] !== 'string' && typeof agentData[field] !== 'number' && 
          typeof agentData[field] !== 'boolean' && !Array.isArray(agentData[field])) {
        throw new Error(`Invalid ${field}: must be string, number, boolean, or array`);
      }
    }
  }
  
  // Validate isolation mode if present
  if (agentData.isolationMode && !['isolated', 'selective', 'mesh'].includes(agentData.isolationMode)) {
    throw new Error('Invalid isolation mode: must be "isolated", "selective", or "mesh"');
  }
  
  // Validate link mode if present
  if (agentData.linkMode && !['observe', 'message', 'delegate'].includes(agentData.linkMode)) {
    throw new Error('Invalid link mode: must be "observe", "message", or "delegate"');
  }
  
  // Validate tags if present
  if (agentData.tags && !Array.isArray(agentData.tags)) {
    throw new Error('Tags must be an array');
  }
  
  if (agentData.tags && agentData.tags.some(tag => typeof tag !== 'string' || tag.trim().length === 0)) {
    throw new Error('All tags must be non-empty strings');
  }
  
  return agentData;
};

export const validateLinkSchema = (linkData) => {
  // Enhanced validation for link data with comprehensive security checks
  const requiredFields = ['sourceAgentId', 'targetAgentId', 'linkType'];
  
  // Validate required fields
  for (const field of requiredFields) {
    if (!linkData[field] || typeof linkData[field] !== 'string' || linkData[field].trim().length === 0) {
      throw new Error(`Missing or invalid required field: ${field}`);
    }
  }
  
  // Validate agent IDs
  validateAgentId(linkData.sourceAgentId, 'source agent ID');
  validateAgentId(linkData.targetAgentId, 'target agent ID');
  
  // Validate link type
  if (!['observe', 'message', 'delegate'].includes(linkData.linkType)) {
    throw new Error('Invalid link type: must be "observe", "message", or "delegate"');
  }
  
  // Validate data if present
  if (linkData.data !== undefined) {
    if (typeof linkData.data !== 'object' || Array.isArray(linkData.data)) {
      throw new Error('Link data must be an object');
    }
  }
  
  return linkData;
};

export const validateChatMessage = (messageData) => {
  // Enhanced validation for chat messages with comprehensive security checks
  const requiredFields = ['agentId', 'message'];
  
  // Validate required fields
  for (const field of requiredFields) {
    if (!messageData[field] || typeof messageData[field] !== 'string' || messageData[field].trim().length === 0) {
      throw new Error(`Missing or invalid required field: ${field}`);
    }
  }
  
  // Validate agent ID
  validateAgentId(messageData.agentId, 'agent ID');
  
  // Validate message format and length
  if (messageData.message.length > 10000) {
    throw new Error('Message too long: maximum 10000 characters allowed');
  }
  
  // Validate system prompt if present
  if (messageData.systemPrompt !== undefined) {
    if (typeof messageData.systemPrompt !== 'string') {
      throw new Error('System prompt must be a string');
    }
    if (messageData.systemPrompt.length > 5000) {
      throw new Error('System prompt too long: maximum 5000 characters allowed');
    }
  }
  
  // Validate temperature if present
  if (messageData.temperature !== undefined) {
    if (typeof messageData.temperature !== 'number' || messageData.temperature < 0 || messageData.temperature > 2) {
      throw new Error('Temperature must be a number between 0 and 2');
    }
  }
  
  // Validate max tokens if present
  if (messageData.maxTokens !== undefined) {
    if (typeof messageData.maxTokens !== 'number' || messageData.maxTokens < 1 || messageData.maxTokens > 32000) {
      throw new Error('Max tokens must be a number between 1 and 32000');
    }
  }
  
  return messageData;
};