import { request } from "node:http";
import { request as httpsRequest } from "node:https";

/**
 * OpenAI Adapter - Provides connectivity to OpenAI-compatible APIs
 * Zero external dependencies. Uses raw node:http/https.
 */
export class OpenAIAdapter {
  constructor({ 
    baseUrl = "https://api.openai.com/v1", 
    model = "gpt-3.5-turbo", 
    apiKey = "",
    timeout = 120000 
  } = {}) {
    // Validate constructor parameters
    if (typeof baseUrl !== 'string' || baseUrl.length === 0 || baseUrl.length > 2048) {
      throw new Error('Invalid baseUrl: must be a string between 1 and 2048 characters');
    }
    
    if (typeof model !== 'string' || model.length === 0 || model.length > 120) {
      throw new Error('Invalid model: must be a string between 1 and 120 characters');
    }
    
    if (typeof apiKey !== 'string' || apiKey.length === 0) {
      throw new Error('Invalid apiKey: must be a non-empty string');
    }
    
    if (typeof timeout !== 'number' || timeout < 1000 || timeout > 300000) {
      throw new Error('Invalid timeout: must be a number between 1000 and 300000 milliseconds');
    }
    
    this.baseUrl = baseUrl;
    this.model = model;
    this.apiKey = apiKey;
    this.timeout = timeout;
    
    // Enhanced URL validation with comprehensive security checks
    try {
      if (baseUrl.length > 2048) {
        throw new Error('URL exceeds maximum allowed length');
      }
      
      const url = new URL(baseUrl);
      
      // Validate protocol
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Invalid URL protocol: must be http: or https:');
      }
      
      // Basic URL structure validation
      if (!url.hostname || url.hostname.length > 253) {
        throw new Error('Invalid hostname');
      }
      
    } catch (urlError) {
      throw new Error(`Invalid baseUrl: ${urlError.message}`);
    }
  }

  /**
   * Send chat completion request to OpenAI-compatible API
   */
  async chat(messages, options = {}) {
    const {
      temperature = 0.7,
      maxTokens = 1000,
      stream = false,
      ...otherOptions
    } = options;

    // Validate messages
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages must be a non-empty array');
    }

    for (const message of messages) {
      if (!message || typeof message !== 'object') {
        throw new Error('Each message must be an object');
      }
      if (!message.role || !message.content) {
        throw new Error('Each message must have role and content properties');
      }
    }

    const url = new URL("/chat/completions", this.baseUrl);
    const isHttps = url.protocol === "https:";
    const httpModule = isHttps ? httpsRequest : request;

    const requestBody = {
      model: this.model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens,
      stream: stream,
      ...otherOptions
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (req) req.destroy();
        reject(new Error('Request timeout'));
      }, this.timeout);

      let req;
      try {
        req = httpModule(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
          },
        }, (res) => {
          clearTimeout(timer);
          
          if (res.statusCode >= 400) {
            let errorData = "";
            res.on("data", (chunk) => { errorData += chunk; });
            res.on("end", () => {
              try {
                const errorJson = JSON.parse(errorData);
                reject(new Error(errorJson.error?.message || `HTTP ${res.statusCode}: ${errorData}`));
              } catch (parseErr) {
                reject(new Error(`HTTP ${res.statusCode}: ${errorData}`));
              }
            });
            return;
          }

          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            clearTimeout(timer);
            try {
              const response = JSON.parse(data);
              
              if (stream) {
                // For streaming responses, return the raw response
                resolve(response);
              } else {
                // For non-streaming responses, extract the content
                if (response.choices && response.choices.length > 0) {
                  const content = response.choices[0].message?.content;
                  if (content !== undefined) {
                    resolve({
                      content: content,
                      role: response.choices[0].message?.role || "assistant",
                      usage: response.usage,
                      model: response.model,
                      id: response.id,
                      created: response.created
                    });
                  } else {
                    throw new Error('No content in response');
                  }
                } else {
                  throw new Error('No choices in response');
                }
              }
            } catch (parseErr) {
              reject(new Error(`Failed to parse response: ${parseErr.message}`));
            }
          });
        });

        req.on("error", (error) => {
          clearTimeout(timer);
          reject(new Error(`Request failed: ${error.message}`));
        });

        req.write(JSON.stringify(requestBody));
        req.end();
      } catch (initError) {
        clearTimeout(timer);
        reject(new Error(`Failed to initialize request: ${initError.message}`));
      }
    });
  }

  /**
   * Get available models from OpenAI-compatible API
   */
  async listModels() {
    const url = new URL("/models", this.baseUrl);
    const isHttps = url.protocol === "https:";
    const httpModule = isHttps ? httpsRequest : request;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (req) req.destroy();
        resolve({ ok: false, models: [], error: 'Models list timeout' });
      }, 10000);

      let req;
      try {
        req = httpModule(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
          },
        }, (res) => {
          clearTimeout(timer);
          
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => {
            clearTimeout(timer);
            try {
              const response = JSON.parse(data);
              
              if (response.data && Array.isArray(response.data)) {
                const models = response.data.map(model => model.id).filter(Boolean);
                resolve({
                  ok: true,
                  models: models.slice(0, 50), // Limit for safety
                  totalModels: models.length
                });
              } else {
                resolve({ ok: false, models: [], error: 'Invalid response format' });
              }
            } catch (parseErr) {
              console.error('Failed to parse models list response:', parseErr);
              resolve({ ok: false, models: [], error: 'Invalid response format' });
            }
          });
        });

        req.on("error", (error) => {
          clearTimeout(timer);
          console.error('Models list request failed:', error);
          resolve({ ok: false, models: [], error: error.message });
        });

        req.end();
      } catch (initError) {
        clearTimeout(timer);
        console.error('Failed to initialize models list request:', initError);
        resolve({ ok: false, models: [], error: initError.message });
      }
    });
  }

  /**
   * Health check for OpenAI provider
   */
  async health() {
    try {
      // Test basic connectivity by listing models
      const health = await this.listModels();
      
      if (health.ok && health.models.length > 0) {
        return { 
          ok: true, 
          models: health.models,
          totalModels: health.totalModels,
          message: 'OpenAI provider is healthy'
        };
      } else {
        return { 
          ok: false, 
          models: [],
          error: health.error || 'No models available'
        };
      }
      
    } catch (error) {
      console.error('OpenAI health check failed:', error);
      return { 
        ok: false, 
        models: [],
        error: error.message || 'Connection failed'
      };
    }
  }

  /**
   * Create provider factory function
   */
  static createProvider(name, config = {}) {
    if (name === 'openai') {
      return new OpenAIAdapter(config);
    }
    
    // Return null for unknown provider names
    return null;
  }
}

// Export the create function for compatibility with other adapters
export const createProvider = (name, config) => {
  return OpenAIAdapter.createProvider(name, config);
};