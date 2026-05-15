/**
 * Links Routes - Handle agent-to-agent link API endpoints
 */

import { applyRateLimit } from "../middleware/security.js";
import { readRequestBody } from "../middleware/requestHandler.js";
import { createLinkSchema } from "../middleware/validationMiddleware.js";
import { parseCreateLinkInput } from "../shared/simpleShared.js";

export function registerLinksRoutes(server, registry, providers, failoverChains, settings) {
  // Link ID validation pattern
  const linkIdPattern = /^[a-zA-Z0-9-]+$/;

  /**
   * Handle link creation
   */
  const handleCreateLink = async (request, response) => {
    if (request.method !== "POST" || request.url !== "/api/links") return false;

    try {
      // Apply rate limiting for link creation
      if (!applyRateLimit(request, response)) {
        return true; // Rate limit exceeded, response already sent
      }
      
      const body = await readRequestBody(request);
      
      // Handle both string and object responses from readRequestBody
      let parsedBody;
      if (body === null) {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Empty request body" }));
      }
      if (typeof body === 'string') {
        try {
          // Enhanced security: Use safer JSON parsing with prototype protection
          parsedBody = JSON.parse(body, (key, value) => {
            // Filter out prototype pollution attempts
            if (key === '__proto__' || key === 'constructor' || key === 'prototype' ||
                key === '__defineGetter__' || key === '__defineSetter__' || 
                key === '__lookupGetter__' || key === '__lookupSetter__') {
              return undefined;
            }
            return value;
          });
        } catch (jsonErr) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid JSON format" }));
        }
      } else if (body !== null && typeof body === 'object') {
        // Enhanced security: Check for prototype pollution in object
        const suspiciousProps = ['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'];
        for (const prop of suspiciousProps) {
          if (Object.prototype.hasOwnProperty.call(body, prop)) {
            return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                   response.end(JSON.stringify({ error: "Invalid request body: contains suspicious properties" }));
          }
        }
        parsedBody = body;
      } else {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Invalid request body" }));
      }
      
      if (!parsedBody || typeof parsedBody !== 'object') {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Request body must be an object" }));
      }
      
      // Apply Zod validation for link creation
      try {
        const validatedBody = createLinkSchema.parse(parsedBody);
        parsedBody = validatedBody;
      } catch (validationError) {
        if (validationError.errors && Array.isArray(validationError.errors)) {
          const errorDetails = validationError.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          }));
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ 
                   error: "Validation failed", 
                   details: errorDetails,
                   message: "The request contains invalid or missing data fields." 
                 }));
        } else {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Validation failed", message: validationError.message || "Invalid input data" }));
        }
      }
      
      console.log('DEBUG: Validated link body:', parsedBody);
      
      // Validate parsed body before calling parseCreateLinkInput
      if (!parsedBody || typeof parsedBody !== 'object') {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Parsed body must be an object" }));
      }
      
      try {
        // Debug: log the parsed body
        console.log('DEBUG: parsedBody:', JSON.stringify(parsedBody, null, 2));
        
        // Prepare the input object for parseCreateLinkInput
        const inputForParse = {
          sourceId: parsedBody.sourceAgentId,
          targetId: parsedBody.targetAgentId,
          mode: parsedBody.mode,
          direction: parsedBody.direction
        };
        console.log('DEBUG: inputForParse:', JSON.stringify(inputForParse, null, 2));
        
        // Parse the link input
        const payload = parseCreateLinkInput(inputForParse);
        console.log('DEBUG: payload after parsing:', JSON.stringify(payload, null, 2));
        console.log('DEBUG: Parsed link payload:', payload);
        
        // Convert to format expected by registry
        const registryPayload = {
          sourceAgentId: payload.sourceId,
          targetAgentId: payload.targetId,
          mode: payload.mode,
          direction: payload.direction
        };
        console.log('DEBUG: Registry payload:', registryPayload);
        
        // Create link using registry
        const link = registry.createLink(registryPayload);
        console.log('DEBUG: Created link:', link);
        
        if (!link) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Failed to create link" }));
        }
        
        return response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ link }));
      } catch (err) {
        // Comprehensive error message sanitization
        let errorMessage = "Invalid request data";
        
        // Log detailed error for debugging (sanitized)
        const safeErrorMessage = sanitizeError(err.message || "Unknown error");
        console.log('Link creation error:', safeErrorMessage);
        
        // Provide specific but safe error messages
        if (err.message && err.message.includes('database')) {
          errorMessage = "Database operation failed";
        } else if (err.message && err.message.includes('not found')) {
          errorMessage = "Agent not found";
        } else if (err.message && err.message.includes('validation')) {
          errorMessage = "Input validation failed";
        } else if (err.message && err.message.includes('security')) {
          errorMessage = "Security validation failed";
        } else if (err.message && err.message.includes('already exists')) {
          errorMessage = "Link already exists";
        }
        
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: errorMessage }));
      }
    } catch (err) {
      // Handle any unexpected errors in the main try block
      console.error('Unexpected error in link creation:', err);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Internal server error" }));
    }
  };

  /**
   * Handle link deletion
   */
  const handleDeleteLink = async (request, response) => {
    if (request.method !== "DELETE" || request.url !== "/api/links") return false;

    try {
      // Apply rate limiting for link deletion
      if (!applyRateLimit(request, response)) {
        return true; // Rate limit exceeded, response already sent
      }
      
      const body = await readRequestBody(request);
      
      // Handle both string and object responses from readRequestBody
      let parsedBody;
      if (body === null) {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Empty request body" }));
      }
      if (typeof body === 'string') {
        try {
          // Enhanced security: Use safer JSON parsing with prototype protection
          parsedBody = JSON.parse(body, (key, value) => {
            // Filter out prototype pollution attempts
            if (key === '__proto__' || key === 'constructor' || key === 'prototype' ||
                key === '__defineGetter__' || key === '__defineSetter__' || 
                key === '__lookupGetter__' || key === '__lookupSetter__') {
              return undefined;
            }
            return value;
          });
        } catch (jsonErr) {
          return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                 response.end(JSON.stringify({ error: "Invalid JSON format" }));
        }
      } else if (body !== null && typeof body === 'object') {
        // Enhanced security: Check for prototype pollution in object
        const suspiciousProps = ['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'];
        for (const prop of suspiciousProps) {
          if (Object.prototype.hasOwnProperty.call(body, prop)) {
            return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
                   response.end(JSON.stringify({ error: "Invalid request body: contains suspicious properties" }));
          }
        }
        parsedBody = body;
      } else {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Invalid request body" }));
      }
      
      if (!parsedBody || typeof parsedBody !== 'object') {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Request body must be an object" }));
      }
      
      // Validate required fields
      if (!parsedBody.sourceAgentId || !parsedBody.targetAgentId) {
        return response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "sourceAgentId and targetAgentId are required" }));
      }
      
      // Delete link using registry
      const deleted = registry.deleteLink({
        sourceAgentId: parsedBody.sourceAgentId,
        targetAgentId: parsedBody.targetAgentId
      });
      
      if (!deleted) {
        return response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }), 
               response.end(JSON.stringify({ error: "Link not found" }));
      }
      
      return response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }), 
             response.end(JSON.stringify({ deleted: true }));
    } catch (err) {
      console.error('Error deleting link:', err);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Internal server error" }));
      return true;
    }
  };

  /**
   * Handle link listing
   */
  const handleListLinks = async (request, response) => {
    if (request.method !== "GET" || request.url !== "/api/links") return false;

    try {
      // Apply rate limiting for link listing
      if (!applyRateLimit(request, response)) {
        return true; // Rate limit exceeded, response already sent
      }
      
      const links = registry.listLinks();
      
      // Limit response size to prevent DoS
      if (links.length > 1000) {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ 
          links: links.slice(0, 1000),
          warning: "Response truncated to first 1000 links"
        }));
        return true;
      }
      
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ links }));
      return true;
    } catch (err) {
      console.error('Error listing links:', err);
      response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Internal server error" }));
      return true;
    }
  };

  /**
   * Register links routes
   */
  server.on('request', async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    // Try each handler in order
    const handlers = [
      handleCreateLink,
      handleDeleteLink,
      handleListLinks
    ];

    for (const handler of handlers) {
      try {
        const handled = await handler(request, response);
        if (handled !== false) return; // Handler processed the request
      } catch (error) {
        console.error('Links route error:', error);
        if (!response.headersSent) {
          response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Internal server error" }));
        }
        return;
      }
    }

    // If no handler matched, let the main server handle it
    return false;
  });
}

// Helper function for error sanitization
function sanitizeError(message) {
  if (typeof message !== 'string') return 'Unknown error';
  
  // Remove potential sensitive information
  return message
    .replace(/password[^]*/gi, '[REDACTED]')
    .replace(/token[^]*/gi, '[REDACTED]')
    .replace(/key[^]*/gi, '[REDACTED]')
    .replace(/secret[^]*/gi, '[REDACTED]');
}