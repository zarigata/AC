/**
 * Tool Handler Implementations - Individual tool implementations
 */

import fs from "node:fs/promises";
import { exec as execCommand } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

/**
 * Safe exec with security restrictions
 */
async function safeExec(command, options = {}) {
  const allowedCommands = [
    'ls', 'cat', 'pwd', 'whoami', 'echo', 'date', 'ps', 'env',
    'grep', 'find', 'head', 'tail', 'wc', 'sort', 'uniq',
    'curl', 'wget', 'git', 'npm', 'node', 'python3', 'python',
    'mkdir', 'rm', 'cp', 'mv', 'chmod', 'chown'
  ];
  
  const disallowedPatterns = [
    /;.*rm/, /\|.*rm/, /&&.*rm/, /||.*rm/,
    /;.*sudo/, /\|.*sudo/, /&&.*sudo/, /||.*sudo/,
    /;.*su/, /\|.*su/, /&&.*su/, /||.*su/,
    /;.*passwd/, /\|.*passwd/, /&&.*passwd/, /||.*passwd/,
    /;.*chmod.*777/, /\|.*chmod.*777/, /&&.*chmod.*777/, /||.*chmod.*777/,
    /;.*chown.*root/, /\|.*chown.*root/, /&&.*chown.*root/, /||.*chown.*root/,
    /;.*>/, /\|.*>/, /&&.*>/, /||.*>/,
    /;.*>>/, /\|.*>>/, /&&.*>>/, /||.*>>/
  ];
  
  // Check if command is allowed
  const baseCommand = command.split(' ')[0];
  if (!allowedCommands.includes(baseCommand)) {
    throw new Error(`Command not allowed: ${baseCommand}`);
  }
  
  // Check for dangerous patterns
  for (const pattern of disallowedPatterns) {
    if (pattern.test(command)) {
      throw new Error('Command contains potentially dangerous patterns');
    }
  }
  
  return new Promise((resolve, reject) => {
    execCommand(command, { 
      ...options,
      timeout: options.timeout || 30000, // 30 second timeout
      maxBuffer: options.maxBuffer || 1024 * 1024 // 1MB buffer
    }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Web Search Tool Handler
 */
export const webSearchHandler = async (tool, context = {}) => {
  const { query } = tool.config || {};
  
  if (!query) {
    throw new Error('web_search requires a query parameter');
  }
  
  try {
    // Try to use web_search function if available
    if (typeof web_search === 'function') {
      return await web_search(query);
    }
    
    // Fallback to basic search
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    
    try {
      const response = await fetch(searchUrl);
      const data = await response.json();
      
      return {
        results: [
          {
            title: data.Title || query,
            snippet: data.Abstract || 'No results found',
            url: data.AbstractURL || '#'
          }
        ],
        query,
        totalResults: 1
      };
    } catch (fetchError) {
      // If web search fails, return error
      throw new Error('Web search failed: ' + fetchError.message);
    }
  } catch (error) {
    throw new Error(`web_search failed: ${error.message}`);
  }
};

/**
 * Execute Command Tool Handler
 */
export const execHandler = async (tool, context = {}) => {
  const { command, cwd = '/app', timeout = 10000 } = tool.config || {};
  
  if (!command) {
    throw new Error('exec requires a command parameter');
  }
  
  try {
    const result = await safeExec(command, { cwd, timeout });
    
    return {
      command,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: 0,
      success: true
    };
  } catch (error) {
    return {
      command,
      stdout: '',
      stderr: error.message,
      exitCode: error.code || 1,
      success: false
    };
  }
};

/**
 * Read File Tool Handler
 */
export const readHandler = async (tool, context = {}) => {
  const { path, encoding = 'utf-8' } = tool.config || {};
  
  if (!path) {
    throw new Error('read requires a path parameter');
  }
  
  // Security check - only allow paths within /app
  if (!path.startsWith('/app') && !path.startsWith('./') && !path.startsWith('../')) {
    throw new Error('read can only access files within /app directory');
  }
  
  try {
    const content = await fs.readFile(path, encoding);
    const stats = await fs.stat(path);
    
    return {
      path,
      content,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      success: true
    };
  } catch (error) {
    throw new Error(`read failed: ${error.message}`);
  }
};

/**
 * Write File Tool Handler
 */
export const writeHandler = async (tool, context = {}) => {
  const { path, content, encoding = 'utf-8', createDirs = false } = tool.config || {};
  
  if (!path || !content) {
    throw new Error('write requires path and content parameters');
  }
  
  // Security check - only allow paths within /app
  if (!path.startsWith('/app') && !path.startsWith('./') && !path.startsWith('../')) {
    throw new Error('write can only create files within /app directory');
  }
  
  try {
    // Create directory if needed
    if (createDirs) {
      const dir = path.split('/').slice(0, -1).join('/');
      if (dir) {
        await fs.mkdir(dir, { recursive: true });
      }
    }
    
    await fs.writeFile(path, content, encoding);
    const stats = await fs.stat(path);
    
    return {
      path,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      success: true
    };
  } catch (error) {
    throw new Error(`write failed: ${error.message}`);
  }
};

/**
 * Calculate Tool Handler
 */
export const calculateHandler = async (tool, context = {}) => {
  const { expression } = tool.config || {};
  
  if (!expression) {
    throw new Error('calculate requires an expression parameter');
  }
  
  try {
    // Basic expression evaluation with security checks
    if (typeof expression !== 'string') {
      throw new Error('Expression must be a string');
    }
    
    // Remove potentially dangerous characters
    const cleanExpression = expression
      .replace(/[<>]/g, '') // Remove < and >
      .replace(/javascript:/gi, '')
      .replace(/eval\(/gi, '')
      .replace(/Function\(/gi, '');
    
    // Only allow basic math operations and parentheses
    const safePattern = /^[\d+\-*/().\s,]+$/;
    if (!safePattern.test(cleanExpression)) {
      throw new Error('Expression contains potentially unsafe characters');
    }
    
    // Evaluate the expression
    const result = Function(`"use strict"; return (${cleanExpression})`)();
    
    return {
      expression,
      result,
      success: true
    };
  } catch (error) {
    throw new Error(`calculate failed: ${error.message}`);
  }
};

/**
 * API Call Tool Handler
 */
export const apiCallHandler = async (tool, context = {}) => {
  const { url, method = 'GET', headers = {}, body } = tool.config || {};
  
  if (!url) {
    throw new Error('api_call requires a url parameter');
  }
  
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    
    const result = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data: await response.text()
    };
    
    return {
      ...result,
      success: response.ok
    };
  } catch (error) {
    throw new Error(`api_call failed: ${error.message}`);
  }
};

/**
 * Register all tool handlers
 */
export function registerAllTools(toolManager) {
  // Register each tool handler
  toolManager.registerTool('web_search', webSearchHandler);
  toolManager.registerTool('exec', execHandler);
  toolManager.registerTool('read', readHandler);
  toolManager.registerTool('write', writeHandler);
  toolManager.registerTool('calculate', calculateHandler);
  toolManager.registerTool('api_call', apiCallHandler);
  
  console.log('All tool handlers registered');
}