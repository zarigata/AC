/**
 * Tool Execution System - Core tool management and execution
 */

import crypto from "node:crypto";
import { inspect } from "node:util";

// Tool registry with available tools and their handlers
const toolRegistry = new Map();

// Import tool handlers
let webSearchHandler, execHandler, readHandler, writeHandler, calculateHandler, apiCallHandler;

try {
  const toolHandlers = await import('./tool-handlers.js');
  webSearchHandler = toolHandlers.webSearchHandler;
  execHandler = toolHandlers.execHandler;
  readHandler = toolHandlers.readHandler;
  writeHandler = toolHandlers.writeHandler;
  calculateHandler = toolHandlers.calculateHandler;
  apiCallHandler = toolHandlers.apiCallHandler;
} catch (err) {
  console.error('Failed to import tool handlers:', err);
}

/**
 * Register a tool handler
 */
export function registerTool(type, handler) {
  if (!type || typeof type !== 'string') {
    throw new Error('Tool type is required');
  }
  
  if (!handler || typeof handler !== 'function') {
    throw new Error('Tool handler must be a function');
  }
  
  toolRegistry.set(type, handler);
  console.log(`Tool registered: ${type}`);
}

/**
 * Get all registered tools
 */
export function getRegisteredTools() {
  return Array.from(toolRegistry.keys());
}

/**
 * Execute a tool
 */
export async function executeTool(tool, context = {}) {
  const { type, config, enabled = true } = tool;
  
  if (!enabled) {
    throw new Error(`Tool ${type} is disabled`);
  }
  
  if (!toolRegistry.has(type)) {
    throw new Error(`Tool ${type} is not available`);
  }
  
  const handler = toolRegistry.get(type);
  
  try {
    const result = await handler(tool, context);
    return {
      success: true,
      result,
      toolId: tool.id,
      toolType: type
    };
  } catch (error) {
    console.error(`Tool execution failed for ${type}:`, error);
    return {
      success: false,
      error: error.message,
      toolId: tool.id,
      toolType: type
    };
  }
}

/**
 * Validate tool configuration
 */
export function validateToolConfig(tool) {
  if (!tool || typeof tool !== 'object') {
    throw new Error('Tool configuration must be an object');
  }
  
  if (!tool.type || typeof tool.type !== 'string') {
    throw new Error('Tool type is required');
  }
  
  const config = tool.config || {};
  const type = tool.type;
  
  // Type-specific validation
  switch (type) {
    case 'web_search':
      if (config.query && typeof config.query !== 'string') {
        throw new Error('web_search query must be a string');
      }
      break;
      
    case 'exec':
      if (config.command && typeof config.command !== 'string') {
        throw new Error('exec command must be a string');
      }
      break;
      
    case 'read':
      if (config.path && typeof config.path !== 'string') {
        throw new Error('read path must be a string');
      }
      break;
      
    case 'write':
      if (config.path && typeof config.path !== 'string') {
        throw new Error('write path must be a string');
      }
      if (config.content && typeof config.content !== 'string') {
        throw new Error('write content must be a string');
      }
      break;
      
    case 'calculate':
      if (config.expression && typeof config.expression !== 'string') {
        throw new Error('calculate expression must be a string');
      }
      break;
  }
  
  return true;
}

/**
 * Get tool description
 */
export function getToolDescription(type) {
  const descriptions = {
    web_search: 'Search the web for information',
    exec: 'Execute shell commands (restricted)',
    read: 'Read file contents',
    write: 'Write content to files',
    calculate: 'Perform mathematical calculations',
    api_call: 'Make HTTP API calls',
    file_system: 'File system operations',
    database: 'Database operations'
  };
  
  return descriptions[type] || 'Unknown tool';
}

/**
 * Create a tool object
 */
export function createTool(type, config = {}, options = {}) {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  
  const tool = {
    id,
    type,
    config,
    enabled: options.enabled !== undefined ? options.enabled : true,
    description: options.description || getToolDescription(type),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  
  validateToolConfig(tool);
  return tool;
}

/**
 * Initialize and register all tool handlers
 */
export function initializeTools() {
  // Register each tool handler directly if available
  if (webSearchHandler) registerTool('web_search', webSearchHandler);
  if (execHandler) registerTool('exec', execHandler);
  if (readHandler) registerTool('read', readHandler);
  if (writeHandler) registerTool('write', writeHandler);
  if (calculateHandler) registerTool('calculate', calculateHandler);
  if (apiCallHandler) registerTool('api_call', apiCallHandler);
  
  console.log('Tool handlers registered:', getRegisteredTools());
}