import { request } from "node:http";

/**
 * Ollama adapter — sends chat messages to a local Ollama instance.
 * Zero external dependencies. Uses raw node:http.
 */
export class OllamaAdapter {
  constructor({ baseUrl = "http://127.0.0.1:11434", model = "qwen3:0.6b", timeout = 30000 } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.timeout = timeout;
  }

  /**
   * Send a chat completion request (non-streaming).
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} options - optional overrides
   * @returns {Promise<{content: string, tokensIn: number, tokensOut: number, duration: number}>}
   */
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

  /**
   * Check if Ollama is reachable and the model is available.
   * @returns {Promise<{ok: boolean, models: string[]}>}
   */
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
