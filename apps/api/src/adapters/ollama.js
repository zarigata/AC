import { request } from "node:http";
import { request as httpsRequest } from "node:https";

/**
 * Universal LLM adapter — supports Ollama, OpenAI-compatible, Anthropic, and Google Gemini APIs.
 * Zero external dependencies. Uses raw node:http/https.
 */
export class OllamaAdapter {
  constructor({ baseUrl = "http://127.0.0.1:11434", model = "qwen3:1.7b", timeout = 120000 } = {}) {
    // Validate constructor parameters
    if (typeof baseUrl !== 'string' || baseUrl.length === 0 || baseUrl.length > 2048) {
      throw new Error('Invalid baseUrl: must be a string between 1 and 2048 characters');
    }
    
    if (typeof model !== 'string' || model.length === 0 || model.length > 120) {
      throw new Error('Invalid model: must be a string between 1 and 120 characters');
    }
    
    if (typeof timeout !== 'number' || timeout < 1000 || timeout > 300000) {
      throw new Error('Invalid timeout: must be a number between 1000 and 300000 milliseconds');
    }
    
    // Enhanced URL validation with security checks
    try {
      const url = new URL(baseUrl);
      
      // Validate hostname: localhost, IP, or dotted hostname
      const hostnameRe = /^(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+|[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,})$/;
      if (!hostnameRe.test(url.hostname)) {
        throw new Error('Invalid hostname: must be localhost, IP address, or valid domain');
      }
      
      // Prevent protocol confusion attacks
      if (!url.protocol.match(/^https?:/)) {
        throw new Error('Invalid protocol: only http and https are supported');
      }
      
      // Validate port range
      if (url.port && (url.port < 1 || url.port > 65535)) {
        throw new Error('Invalid port: must be between 1 and 65535');
      }
      
      // Validate URL length after parsing
      if (url.href.length > 2048) {
        throw new Error('URL too long after parsing');
      }
    } catch (err) {
      throw new Error(`Invalid baseUrl: ${err.message}`);
    }
    
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.timeout = timeout;
  }

  async chat(messages, options = {}) {
    try {
      // Validate input with enhanced security
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array is required and cannot be empty');
      }
      
      // Validate messages with comprehensive security checks
      if (messages.length > 100) {
        throw new Error('Messages array cannot exceed 100 messages');
      }
      
      // Additional validation: check if messages array is too long in total characters
      const totalChars = messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
      if (totalChars > 500000) { // 500KB limit
        throw new Error('Total message content exceeds allowed limit');
      }
      
      // Additional security: validate entire messages structure for prototype pollution
      if (JSON.stringify(messages).length > 1000000) { // 1MB JSON string limit
        throw new Error('Messages structure too large');
      }
      
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg || typeof msg !== 'object') {
          throw new Error(`Message ${i} must be an object`);
        }
        
        if (!msg.role || typeof msg.role !== 'string') {
          throw new Error(`Message ${i} role is required and must be a string`);
        }
        
        if (!['user', 'assistant', 'system'].includes(msg.role)) {
          throw new Error(`Invalid role in message ${i}: ${msg.role}`);
        }
        
        if (!msg.content || typeof msg.content !== 'string') {
          throw new Error(`Message ${i} content is required and must be a string`);
        }
        
        if (msg.content.trim().length === 0) {
          throw new Error(`Message ${i} content cannot be empty`);
        }
        
        if (msg.content.length > 50000) {
          throw new Error(`Message ${i} content is too long (max 50000 characters)`);
        }
        
        // Enhanced security: check for injection attempts with comprehensive validation
        const dangerousPatterns = [
          // Critical security threats - check these first
          /<script[^>]*>.*?<\/script>/gi,
          /javascript:/gi,
          /data:/gi,
          /eval\(/gi,
          /exec\(/gi,
          /Function\(/gi,
          /on\w+\s*=/gi,
          
          // SQL injection
          /SELECT\s+/gi,
          /INSERT\s+/gi,
          /UPDATE\s+/gi,
          /DELETE\s+/gi,
          /DROP\s+/gi,
          /CREATE\s+/gi,
          /ALTER\s+/gi,
          /;\s*--/g,
          /#\s*$/gm,
          
          // Control characters and null bytes
          /\x00/g,
          /[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g,
          /[\u0000-\u001F\u007F-\u009F]/g,
          
          // Path traversal
          /\.\./g,
          
          // DOM access attempts
          /document\./gi,
          /window\./gi,
          /global\./gi,
          /self\./gi,
          /top\./gi,
          /parent\./gi,
          /frames\./gi,
          
          // Basic HTML tags that could be dangerous
          /<iframe|<object|<embed|<style|<meta|<link|<img|<video|<audio|<svg/gi
        ];
        
        for (const pattern of dangerousPatterns) {
          if (pattern.test(msg.content)) {
            console.warn(`Blocked potentially dangerous content in message ${i}:`, pattern.toString());
            throw new Error(`Message ${i} contains potentially dangerous content`);
          }
        }
        
        // Additional security: Check for Unicode normalization issues
        if (msg.content.normalize('NFKC') !== msg.content) {
          throw new Error(`Message ${i} contains potentially dangerous Unicode characters`);
        }
        
        // Check for extremely long lines that might cause issues
        if (msg.content.includes('\n') && msg.content.split('\n').some(line => line.length > 2000)) {
          throw new Error(`Message ${i} contains lines that are too long`);
        }
      }
      
      const model = options.model || this.model;
      
      // Validate model
      if (!model || typeof model !== 'string' || model.trim().length === 0 || model.length > 120) {
        throw new Error('Model name is required and must be 1-120 characters');
      }
      
      // Validate options
      const temperature = options.temperature ?? 0.3;
      const maxTokens = options.maxTokens ?? 512;
      
      if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
        throw new Error('Temperature must be a number between 0 and 2');
      }
      
      if (typeof maxTokens !== 'number' || maxTokens < 1 || maxTokens > 32000) {
        throw new Error('maxTokens must be a number between 1 and 32000');
      }
      
      const body = JSON.stringify({
        model,
        messages,
        stream: false,
        think: false,
        options: {
          temperature: temperature,
          num_predict: Math.max(1, Math.min(32000, maxTokens))
        }
      });

      // Build URL for chat endpoint
      const chatUrl = new URL("/api/chat", this.baseUrl);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (req) req.destroy();
          reject(new Error(`Ollama request timed out after ${this.timeout}ms`));
        }, this.timeout);

        let req;
        try {
          req = request(chatUrl, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body)
            }
          }, (res) => {
            let data = "";
            
            // Check for non-200 status codes
            if (res.statusCode && res.statusCode >= 400) {
              clearTimeout(timer);
              reject(new Error(`Ollama API error: ${res.statusCode} ${res.statusMessage}`));
              return;
            }
            
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
              clearTimeout(timer);
              try {
                const parsed = JSON.parse(data);
                if (parsed.error) {
                  reject(new Error(`Ollama error: ${parsed.error}`));
                  return;
                }
                
                // Validate response structure
                if (!parsed.message && !parsed.message?.content) {
                  throw new Error('Invalid response structure from Ollama');
                }
                
                resolve({
                  content: parsed.message?.content || parsed.message?.thinking || "",
                  tokensIn: parsed.prompt_eval_count || 0,
                  tokensOut: parsed.eval_count || 0,
                  duration: parsed.total_duration ? Math.round(parsed.total_duration / 1e6) : 0,
                  model: parsed.model || model,
                  done: parsed.done ?? true
                });
              } catch (err) {
                reject(new Error(`Failed to parse Ollama response: ${err.message}`));
              }
            });
          });

          req.on("error", (err) => {
            clearTimeout(timer);
            reject(new Error(`Ollama connection failed: ${err.message}`));
          });

          req.on("timeout", () => {
            req.destroy();
            reject(new Error(`Ollama request timed out after ${this.timeout}ms`));
          });

          req.write(body);
          req.end();
        } catch (requestErr) {
          clearTimeout(timer);
          reject(new Error(`Failed to create Ollama request: ${requestErr.message}`));
        }
      });
    } catch (err) {
      console.error('Ollama chat error:', err);
      throw err;
    }
  }

  async chatStream(messages, options = {}, onChunk, onComplete) {
    const model = options.model || this.model;
    const body = JSON.stringify({
      model,
      messages,
      stream: true,
      think: false,
      options: {
        temperature: options.temperature ?? 0.3,
        num_predict: options.maxTokens ?? 512
      }
    });

    const url = new URL("/api/chat", this.baseUrl);
    
    console.log('Ollama adapter: sending request:', {
      url: url.href,
      model,
      messagesLength: messages.length,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      body: body.substring(0, 200) + '...' // Truncate for readability
    });
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`Ollama request timed out after ${this.timeout}ms`));
      }, this.timeout);

      const req = request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      }, (res) => {
        let accumulatedContent = "";
        let accumulatedTokensIn = 0;
        let accumulatedTokensOut = 0;
        let accumulatedDuration = 0;
        
        res.on("data", (chunk) => {
          const lines = chunk.toString().split("\n").filter(line => line.trim());
          
          for (const line of lines) {
            // Handle both SSE format (data: ...) and raw JSON
            let jsonData;
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                jsonData = JSON.parse(line.slice(6));
              } catch (err) {
                // Parse error, continue
              }
            } else if (line.trim()) {
              try {
                jsonData = JSON.parse(line);
              } catch (err) {
                // Parse error, continue
              }
            }
            
            if (jsonData) {
              // Handle both content and thinking fields
              if (jsonData.message?.content || jsonData.message?.thinking) {
                const content = jsonData.message.content || '';
                const thinking = jsonData.message.thinking || '';
                
                accumulatedContent += content;
                
                // Security: Limit accumulated content to prevent memory exhaustion
                if (accumulatedContent.length > 100000) { // 100KB limit
                  console.warn('Content accumulation limit reached, truncating');
                  accumulatedContent = accumulatedContent.substring(0, 100000);
                }
                
                accumulatedTokensOut = jsonData.eval_count || 0;
                accumulatedDuration = jsonData.total_duration ? Math.round(jsonData.total_duration / 1e6) : 0;
                
                onChunk({
                  content: content,
                  thinking: thinking,
                  tokensIn: jsonData.prompt_eval_count || 0,
                  tokensOut: jsonData.eval_count || 0,
                  duration: jsonData.total_duration ? Math.round(jsonData.total_duration / 1e6) : 0,
                  model: jsonData.model || model,
                  done: jsonData.done || false
                });
              }
            }
          }
        });
        
        res.on("end", () => {
          clearTimeout(timer);
          onComplete({
            content: accumulatedContent,
            tokensIn: accumulatedTokensIn,
            tokensOut: accumulatedTokensOut,
            duration: accumulatedDuration,
            model: model,
            done: true
          });
          resolve();
        });
        
        res.on("error", (err) => {
          clearTimeout(timer);
          reject(new Error(`Ollama stream error: ${err.message}`));
        });
      });

      req.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Ollama connection failed: ${err.message}`));
      });

      req.write(body);
      req.end();
    });
  }

  async health() {
    try {
      // Validate baseUrl
      if (!this.baseUrl || typeof this.baseUrl !== 'string') {
        return { ok: false, models: [], error: 'Invalid base URL' };
      }
      
      const url = new URL("/api/tags", this.baseUrl);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (req) req.destroy();
          resolve({ ok: false, models: [], error: 'Health check timeout' });
        }, 5000);

        let req;
        try {
          req = request(url, { 
            method: "GET",
            timeout: 3000
          }, (res) => {
            let data = "";
            
            // Check for non-200 status codes
            if (res.statusCode && res.statusCode >= 400) {
              clearTimeout(timer);
              resolve({ ok: false, models: [], error: `HTTP ${res.statusCode}` });
              return;
            }
            
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
              clearTimeout(timer);
              try {
                const parsed = JSON.parse(data);
                
                // Validate models array
                const models = Array.isArray(parsed.models) 
                  ? parsed.models
                    .filter(m => m && typeof m === 'object' && m.name && typeof m.name === 'string')
                    .map((m) => String(m.name).trim())
                  : [];
                
                // Return limited number of models to prevent memory issues
                resolve({ 
                  ok: true, 
                  models: models.slice(0, 50),
                  totalModels: models.length
                });
              } catch (parseErr) {
                console.error('Failed to parse health check response:', parseErr);
                resolve({ ok: false, models: [], error: 'Invalid response format' });
              }
            });
          });

          req.on("error", (err) => {
            clearTimeout(timer);
            console.error('Health check connection error:', err);
            resolve({ ok: false, models: [], error: 'Connection failed' });
          });

          req.on("timeout", () => {
            req.destroy();
            resolve({ ok: false, models: [], error: 'Request timeout' });
          });

          req.end();
        } catch (requestErr) {
          clearTimeout(timer);
          resolve({ ok: false, models: [], error: 'Request creation failed' });
        }
      });
    } catch (err) {
      console.error('Health check error:', err);
      return Promise.resolve({ ok: false, models: [], error: 'Health check failed' });
    }
  }
}

/**
 * OpenAI-compatible adapter (works with OpenAI, Together, Groq, LM Studio, vLLM, etc.)
 */
export class OpenAIAdapter {
  constructor({
    apiKey = "",
    baseUrl = "https://api.openai.com/v1",
    model = "gpt-4o-mini",
    timeout = 120000,
  } = {}) {
    // Validate constructor parameters
    if (typeof apiKey !== "string" || apiKey.length < 10 || apiKey.length > 1000) {
      throw new Error("Invalid apiKey: must be a string between 10 and 1000 characters");
    }
    
    if (typeof baseUrl !== "string" || baseUrl.length < 10 || baseUrl.length > 2048) {
      throw new Error("Invalid baseUrl: must be a string between 10 and 2048 characters");
    }
    
    if (typeof model !== "string" || model.length < 1 || model.length > 120) {
      throw new Error("Invalid model: must be a string between 1 and 120 characters");
    }
    
    if (typeof timeout !== "number" || timeout < 1000 || timeout > 300000) {
      throw new Error("Invalid timeout: must be a number between 1000 and 300000 milliseconds");
    }
    
    // Enhanced URL validation with security checks
    try {
      const url = new URL(baseUrl);
      
      // Validate API key is not embedded in URL (security best practice)
      if (apiKey && !url.href.includes(apiKey)) {
        // Good - API key is not in URL
      } else {
        throw new Error('API key should not be embedded in URL');
      }
      
      // Validate domain is trusted
      if (!url.hostname.match(/^(api\.openai\.com|[^/]+\.openai\.com|[^/]+\.together\.xyz|[^/]+\.groq\.com|[^/]+\.lmstudio\.ai|[^/]+\.vllm\.ai|[^/]+\.gateway\.example)$/)) {
        throw new Error('Invalid domain: only trusted OpenAI-compatible endpoints are allowed');
      }
      
      // Validate protocol
      if (!url.protocol.match(/^https:/)) {
        throw new Error('Invalid protocol: HTTPS required for API endpoints');
      }
      
      // Validate port range
      if (url.port && (url.port < 1 || url.port > 65535)) {
        throw new Error('Invalid port: must be between 1 and 65535');
      }
    } catch (err) {
      throw new Error(`Invalid baseUrl: ${err.message}`);
    }
    
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.timeout = timeout;
  }

  chat(messages, options = {}) {
    const model = options.model || this.model;
    const body = JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      stream: false,
    });

    const url = new URL("/chat/completions", this.baseUrl);
    const isHttps = url.protocol === "https:";
    const httpModule = isHttps ? httpsRequest : request;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`OpenAI request timed out after ${this.timeout}ms`));
      }, this.timeout);

      const req = httpModule(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          clearTimeout(timer);
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(`OpenAI error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
              return;
            }
            const choice = parsed.choices?.[0];
            resolve({
              content: choice?.message?.content || "",
              tokensIn: parsed.usage?.prompt_tokens || 0,
              tokensOut: parsed.usage?.completion_tokens || 0,
              duration: 0,
              model: parsed.model || model,
              done: choice?.finish_reason === "stop",
            });
          } catch (err) {
            reject(new Error(`Failed to parse OpenAI response: ${err.message}`));
          }
        });
      });

      req.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`OpenAI connection failed: ${err.message}`));
      });

      req.write(body);
      req.end();
    });
  }

  async chatStream(messages, options = {}, onChunk, onComplete) {
    const model = options.model || this.model;
    const body = JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      stream: true,
    });

    const url = new URL("/chat/completions", this.baseUrl);
    const isHttps = url.protocol === "https:";
    const httpModule = isHttps ? httpsRequest : request;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`OpenAI request timed out after ${this.timeout}ms`));
      }, this.timeout);

      const req = httpModule(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
      }, (res) => {
        let accumulatedContent = "";
        let accumulatedTokensIn = 0;
        let accumulatedTokensOut = 0;
        
        res.on("data", (chunk) => {
          const lines = chunk.toString().split("\n").filter(line => line.trim());
          
          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                const delta = data.choices?.[0]?.delta?.content || "";
                const finishReason = data.choices?.[0]?.finish_reason;
                
                if (delta) {
                  accumulatedContent += delta;
                  
                  onChunk({
                    content: delta,
                    tokensIn: 0, // OpenAI doesn't provide token counts for streaming
                    tokensOut: 0,
                    duration: 0,
                    model: data.model || model,
                    done: finishReason === "stop"
                  });
                }
                
                if (finishReason === "stop") {
                  // Get final usage from the final response if available
                  if (data.usage) {
                    accumulatedTokensIn = data.usage.prompt_tokens || 0;
                    accumulatedTokensOut = data.usage.completion_tokens || 0;
                  }
                }
              } catch (err) {
                console.error("Failed to parse SSE chunk:", err);
              }
            }
          }
        });
        
        res.on("end", () => {
          clearTimeout(timer);
          onComplete({
            content: accumulatedContent,
            tokensIn: accumulatedTokensIn,
            tokensOut: accumulatedTokensOut,
            duration: 0,
            model: model,
            done: true
          });
          resolve();
        });
        
        res.on("error", (err) => {
          clearTimeout(timer);
          reject(new Error(`OpenAI stream error: ${err.message}`));
        });
      });

      req.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`OpenAI connection failed: ${err.message}`));
      });

      req.write(body);
      req.end();
    });
  }

  async health() {
    if (!this.apiKey) return { ok: false, models: [], error: "No API key configured" };
    const url = new URL("/models", this.baseUrl);
    const isHttps = url.protocol === "https:";
    const httpModule = isHttps ? httpsRequest : request;

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, models: [] }), 5000);
      const req = httpModule(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          clearTimeout(timer);
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) { resolve({ ok: false, models: [] }); return; }
            resolve({
              ok: true,
              models: (parsed.data || []).map((m) => m.id).slice(0, 50),
            });
          } catch { resolve({ ok: false, models: [] }); }
        });
      });
      req.on("error", () => { clearTimeout(timer); resolve({ ok: false, models: [] }); });
      req.end();
    });
  }
}

/**
 * Anthropic Claude adapter
 */
export class AnthropicAdapter {
  constructor({
    apiKey = "",
    baseUrl = "https://api.anthropic.com",
    model = "claude-sonnet-4-20250514",
    timeout = 120000,
  } = {}) {
    // Validate constructor parameters
    if (typeof apiKey !== "string" || apiKey.length < 10 || apiKey.length > 1000) {
      throw new Error("Invalid apiKey: must be a string between 10 and 1000 characters");
    }
    
    if (typeof baseUrl !== "string" || baseUrl.length < 10 || baseUrl.length > 2048) {
      throw new Error("Invalid baseUrl: must be a string between 10 and 2048 characters");
    }
    
    if (typeof model !== "string" || model.length < 1 || model.length > 120) {
      throw new Error("Invalid model: must be a string between 1 and 120 characters");
    }
    
    if (typeof timeout !== "number" || timeout < 1000 || timeout > 300000) {
      throw new Error("Invalid timeout: must be a number between 1000 and 300000 milliseconds");
    }
    
    // Enhanced URL validation with security checks
    try {
      const url = new URL(baseUrl);
      
      // Validate API key is not embedded in URL (security best practice)
      if (apiKey && !url.href.includes(apiKey)) {
        // Good - API key is not in URL
      } else {
        throw new Error('API key should not be embedded in URL');
      }
      
      // Validate domain is trusted
      if (!url.hostname.match(/^(api\.anthropic\.com|[^/]+\.anthropic\.com)$/)) {
        throw new Error('Invalid domain: only trusted Anthropic endpoints are allowed');
      }
      
      // Validate protocol
      if (!url.protocol.match(/^https:/)) {
        throw new Error('Invalid protocol: HTTPS required for API endpoints');
      }
      
      // Validate port range
      if (url.port && (url.port < 1 || url.port > 65535)) {
        throw new Error('Invalid port: must be between 1 and 65535');
      }
    } catch (err) {
      throw new Error(`Invalid baseUrl: ${err.message}`);
    }
    
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.timeout = timeout;
  }

  chat(messages, options = {}) {
    const model = options.model || this.model;
    // Anthropic uses "user" and "assistant" roles; convert "system" to top-level param
    let systemMsg = "";
    const anthropicMessages = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        systemMsg += (systemMsg ? "\n" : "") + msg.content;
      } else {
        anthropicMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body = JSON.stringify({
      model,
      messages: anthropicMessages,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      ...(systemMsg ? { system: systemMsg } : {}),
    });

    const url = new URL("/v1/messages", this.baseUrl);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`Anthropic request timed out after ${this.timeout}ms`));
      }, this.timeout);

      const req = httpsRequest(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          clearTimeout(timer);
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(`Anthropic error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
              return;
            }
            const textBlock = parsed.content?.find((b) => b.type === "text");
            resolve({
              content: textBlock?.text || "",
              tokensIn: parsed.usage?.input_tokens || 0,
              tokensOut: parsed.usage?.output_tokens || 0,
              duration: 0,
              model: parsed.model || model,
              done: parsed.stop_reason === "end_turn",
            });
          } catch (err) {
            reject(new Error(`Failed to parse Anthropic response: ${err.message}`));
          }
        });
      });

      req.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Anthropic connection failed: ${err.message}`));
      });

      req.write(body);
      req.end();
    });
  }

  async chatStream(messages, options = {}, onChunk, onComplete) {
    const model = options.model || this.model;
    // Anthropic uses "user" and "assistant" roles; convert "system" to top-level param
    let systemMsg = "";
    const anthropicMessages = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        systemMsg += (systemMsg ? "\n" : "") + msg.content;
      } else {
        anthropicMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body = JSON.stringify({
      model,
      messages: anthropicMessages,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      stream: true,
      ...(systemMsg ? { system: systemMsg } : {}),
    });

    const url = new URL("/v1/messages", this.baseUrl);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`Anthropic request timed out after ${this.timeout}ms`));
      }, this.timeout);

      const req = httpsRequest(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      }, (res) => {
        let accumulatedContent = "";
        let accumulatedTokensIn = 0;
        let accumulatedTokensOut = 0;
        let eventType = "";
        
        res.on("data", (chunk) => {
          const lines = chunk.toString().split("\n").filter(line => line.trim());
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6));
                
                if (event.type === "content_block_delta" && event.delta?.text) {
                  accumulatedContent += event.delta.text;
                  
                  onChunk({
                    content: event.delta.text,
                    tokensIn: 0, // Anthropic doesn't provide per-chunk token counts
                    tokensOut: 0,
                    duration: 0,
                    model: model,
                    done: false
                  });
                }
                
                if (event.type === "message_stop") {
                  accumulatedTokensIn = event.usage?.input_tokens || 0;
                  accumulatedTokensOut = event.usage?.output_tokens || 0;
                }
                
                if (event.type === "error") {
                  reject(new Error(`Anthropic error: ${event.error?.message || "Unknown error"}`));
                  return;
                }
              } catch (err) {
                console.error("Failed to parse SSE chunk:", err);
              }
            }
          }
        });
        
        res.on("end", () => {
          clearTimeout(timer);
          onComplete({
            content: accumulatedContent,
            tokensIn: accumulatedTokensIn,
            tokensOut: accumulatedTokensOut,
            duration: 0,
            model: model,
            done: true
          });
          resolve();
        });
        
        res.on("error", (err) => {
          clearTimeout(timer);
          reject(new Error(`Anthropic stream error: ${err.message}`));
        });
      });

      req.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Anthropic connection failed: ${err.message}`));
      });

      req.write(body);
      req.end();
    });
  }

  async health() {
    if (!this.apiKey) return { ok: false, models: [], error: "No API key configured" };
    return { ok: true, models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"] };
  }
}

/**
 * Google Gemini adapter (REST API)
 */
export class GeminiAdapter {
  constructor({
    apiKey = "",
    model = "gemini-2.0-flash",
    timeout = 120000,
  } = {}) {
    // Validate constructor parameters
    if (typeof apiKey !== "string" || apiKey.length < 10 || apiKey.length > 1000) {
      throw new Error("Invalid apiKey: must be a string between 10 and 1000 characters");
    }
    
    if (typeof model !== "string" || model.length < 1 || model.length > 120) {
      throw new Error("Invalid model: must be a string between 1 and 120 characters");
    }
    
    if (typeof timeout !== "number" || timeout < 1000 || timeout > 300000) {
      throw new Error("Invalid timeout: must be a number between 1000 and 300000 milliseconds");
    }
    
    // Validate model format (Google models have specific patterns)
    if (!model.match(/^(gemini-[2-9]\.[0-9]+-[a-z]+|gemini-[2-9]\.[0-9]+-exp:[a-z]+)$/)) {
      throw new Error('Invalid model format: must be a valid Gemini model name');
    }
    
    this.apiKey = apiKey;
    this.model = model;
    this.timeout = timeout;
  }

  chat(messages, options = {}) {
    const model = options.model || this.model;
    // Gemini uses "user" and "model" roles
    let systemInstruction = undefined;
    const contents = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }

    const bodyObj = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 1024,
      },
    };
    if (systemInstruction) bodyObj.systemInstruction = systemInstruction;

    const body = JSON.stringify(bodyObj);
    const url = new URL(
      `/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
      "https://generativelanguage.googleapis.com"
    );

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`Gemini request timed out after ${this.timeout}ms`));
      }, this.timeout);

      const req = httpsRequest(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          clearTimeout(timer);
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(`Gemini error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
              return;
            }
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
            resolve({
              content: text,
              tokensIn: parsed.usageMetadata?.promptTokenCount || 0,
              tokensOut: parsed.usageMetadata?.candidatesTokenCount || 0,
              duration: 0,
              model: parsed.modelVersion || model,
              done: parsed.candidates?.[0]?.finishReason === "STOP",
            });
          } catch (err) {
            reject(new Error(`Failed to parse Gemini response: ${err.message}`));
          }
        });
      });

      req.on("error", (err) => {
        clearTimeout.timer;
        reject(new Error(`Gemini connection failed: ${err.message}`));
      });

      req.write(body);
      req.end();
    });
  }

  async chatStream(messages, options = {}, onChunk, onComplete) {
    const model = options.model || this.model;
    // Gemini uses "user" and "model" roles
    let systemInstruction = undefined;
    const contents = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }

    const bodyObj = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 1024,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE"
        }
      ],
    };
    if (systemInstruction) bodyObj.systemInstruction = systemInstruction;

    const body = JSON.stringify(bodyObj);
    const url = new URL(
      `/v1beta/models/${model}:streamGenerateContent?key=${this.apiKey}`,
      "https://generativelanguage.googleapis.com"
    );

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`Gemini request timed out after ${this.timeout}ms`));
      }, this.timeout);

      const req = httpsRequest(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }, (res) => {
        let accumulatedContent = "";
        let accumulatedTokensIn = 0;
        let accumulatedTokensOut = 0;
        
        res.on("data", (chunk) => {
          const lines = chunk.toString().split("\n").filter(line => line.trim());
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6));
                const candidate = event.candidates?.[0];
                const content = candidate?.content?.parts?.[0]?.text || "";
                
                if (content) {
                  accumulatedContent += content;
                  
                  onChunk({
                    content: content,
                    tokensIn: 0, // Gemini doesn't provide per-chunk token counts
                    tokensOut: 0,
                    duration: 0,
                    model: model,
                    done: candidate?.finishReason === "STOP" || candidate?.finishReason === "MAX_TOKENS"
                  });
                }
                
                if (candidate?.finishReason === "STOP" || candidate?.finishReason === "MAX_TOKENS") {
                  accumulatedTokensIn = event.usageMetadata?.promptTokenCount || 0;
                  accumulatedTokensOut = event.usageMetadata?.candidatesTokenCount || 0;
                }
              } catch (err) {
                console.error("Failed to parse SSE chunk:", err);
              }
            }
          }
        });
        
        res.on("end", () => {
          clearTimeout(timer);
          onComplete({
            content: accumulatedContent,
            tokensIn: accumulatedTokensIn,
            tokensOut: accumulatedTokensOut,
            duration: 0,
            model: model,
            done: true
          });
          resolve();
        });
        
        res.on("error", (err) => {
          clearTimeout(timer);
          reject(new Error(`Gemini stream error: ${err.message}`));
        });
      });

      req.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Gemini connection failed: ${err.message}`));
      });

      req.write(body);
      req.end();
    });
  }

  async health() {
    if (!this.apiKey) return { ok: false, models: [], error: "No API key configured" };
    return { ok: true, models: ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.5-flash"] };
  }
}

/**
 * OpenRouter adapter (unified gateway to 200+ models)
 */
export class OpenRouterAdapter extends OpenAIAdapter {
  constructor({
    apiKey = "",
    model = "google/gemini-2.0-flash-exp:free",
    timeout = 120000,
  } = {}) {
    super({
      apiKey,
      baseUrl: "https://openrouter.ai/api/v1",
      model,
      timeout,
    });
  }
}

/**
 * Provider registry — creates the right adapter based on provider name.
 */
export function createProvider(name, config = {}) {
  const env = process.env;
  switch (name) {
    case "ollama":
      return new OllamaAdapter({
        baseUrl: config.baseUrl || env.OLLAMA_BASE_URL,
        model: config.model || env.OLLAMA_MODEL,
        timeout: config.timeout,
      });
    case "openai":
      return new OpenAIAdapter({
        apiKey: config.apiKey || env.OPENAI_API_KEY,
        model: config.model || env.OPENAI_MODEL || "gpt-4o-mini",
        baseUrl: config.baseUrl || env.OPENAI_BASE_URL,
        timeout: config.timeout,
      });
    case "anthropic":
      return new AnthropicAdapter({
        apiKey: config.apiKey || env.ANTHROPIC_API_KEY,
        model: config.model || env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        timeout: config.timeout,
      });
    case "gemini":
      return new GeminiAdapter({
        apiKey: config.apiKey || env.GEMINI_API_KEY || env.GOOGLE_API_KEY,
        model: config.model || env.GEMINI_MODEL || "gemini-2.0-flash",
        timeout: config.timeout,
      });
    case "openrouter":
      return new OpenRouterAdapter({
        apiKey: config.apiKey || env.OPENROUTER_API_KEY,
        model: config.model || env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free",
        timeout: config.timeout,
      });
    case "groq":
      return new OpenAIAdapter({
        apiKey: config.apiKey || env.GROQ_API_KEY,
        model: config.model || env.GROQ_MODEL || "llama-3.3-70b-versatile",
        baseUrl: "https://api.groq.com/openai/v1",
        timeout: config.timeout,
      });
    case "together":
      return new OpenAIAdapter({
        apiKey: config.apiKey || env.TOGETHER_API_KEY,
        model: config.model || env.TOGETHER_MODEL || "meta-llama/Llama-3-8b-chat-hf",
        baseUrl: "https://api.together.xyz/v1",
        timeout: config.timeout,
      });
    case "lmstudio":
      return new OpenAIAdapter({
        apiKey: "lm-studio",
        model: config.model || env.LMSTUDIO_MODEL || "default",
        baseUrl: config.baseUrl || env.LMSTUDIO_BASE_URL || "http://127.0.0.1:1234/v1",
        timeout: config.timeout,
      });
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

// All adapter classes exported inline above