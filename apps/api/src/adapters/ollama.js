import { request } from "node:http";
import { request as httpsRequest } from "node:https";

/**
 * Universal LLM adapter — supports Ollama, OpenAI-compatible, Anthropic, and Google Gemini APIs.
 * Zero external dependencies. Uses raw node:http/https.
 */
export class OllamaAdapter {
  constructor({ baseUrl = "http://127.0.0.1:11434", model = "qwen3:1.7b", timeout = 120000 } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.timeout = timeout;
  }

  async chat(messages, options = {}) {
    const model = options.model || this.model;
    const body = JSON.stringify({
      model,
      messages,
      stream: false,
      think: false,
      options: {
        temperature: options.temperature ?? 0.3,
        num_predict: options.maxTokens ?? 512
      }
    });

    const url = new URL("/api/chat", this.baseUrl);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`Ollama request timed out after ${this.timeout}ms`));
      }, this.timeout);

      const req = request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          clearTimeout(timer);
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(`Ollama error: ${parsed.error}`));
              return;
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

      req.write(body);
      req.end();
    });
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
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.message?.content) {
                  accumulatedContent += data.message.content;
                  accumulatedTokensOut = data.eval_count || 0;
                  accumulatedDuration = data.total_duration ? Math.round(data.total_duration / 1e6) : 0;
                  
                  onChunk({
                    content: data.message.content,
                    tokensIn: data.prompt_eval_count || 0,
                    tokensOut: data.eval_count || 0,
                    duration: data.total_duration ? Math.round(data.total_duration / 1e6) : 0,
                    model: data.model || model,
                    done: data.done || false
                  });
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
    const url = new URL("/api/tags", this.baseUrl);

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, models: [] }), 5000);

      const req = request(url, { method: "GET" }, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          clearTimeout(timer);
          try {
            const parsed = JSON.parse(data);
            const models = (parsed.models || []).map((m) => m.name);
            resolve({ ok: true, models });
          } catch {
            resolve({ ok: false, models: [] });
          }
        });
      });

      req.on("error", () => {
        clearTimeout(timer);
        resolve({ ok: false, models: [] });
      });

      req.end();
    });
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