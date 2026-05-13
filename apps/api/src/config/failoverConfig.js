/**
 * Failover Chain Configuration - Provider resilience and health monitoring
 * 
 * Configures automatic provider failover with health monitoring
 * Priority chain: Ollama → Ollama Cloud → Z.AI → Anthropic → OpenAI
 */

// Failover chain configuration matching sprint requirements
export const FAILOVER_CONFIG = {
  default: "main-chain",
  
  chains: {
    "main-chain": {
      chain: [
        {
          name: "ollama",
          config: {
            baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
            model: process.env.OLLAMA_MODEL || "qwen3:1.7b",
            timeout: parseInt(process.env.OLLAMA_TIMEOUT || "120000", 10)
          }
        },
        {
          name: "openai",
          config: {
            baseUrl: "https://api.openai.com/v1",
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            timeout: parseInt(process.env.OPENAI_TIMEOUT || "120000", 10),
            apiKey: process.env.OPENAI_API_KEY
          }
        },
        {
          name: "anthropic",
          config: {
            apiKey: process.env.ANTHROPIC_API_KEY,
            model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
            timeout: parseInt(process.env.ANTHROPIC_TIMEOUT || "120000", 10)
          }
        },
        {
          name: "openai",
          config: {
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
            timeout: parseInt(process.env.OPENAI_TIMEOUT || "120000", 10)
          }
        }
      ],
      config: {
        healthCacheTTL: 30000, // 30 seconds cache
        maxRetries: 3,
        retryDelay: 1000,
        healthCheckInterval: 60000 // 1 minute between health checks
      }
    },
    
    "ollama-only": {
      chain: [
        {
          name: "ollama",
          config: {
            baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
            model: process.env.OLLAMA_MODEL || "qwen3:1.7b",
            timeout: parseInt(process.env.OLLAMA_TIMEOUT || "120000", 10)
          }
        }
      ],
      config: {
        healthCacheTTL: 30000,
        maxRetries: 2,
        retryDelay: 2000,
        healthCheckInterval: 30000 // 30 seconds between health checks
      }
    }
  }
};

/**
 * Provider health monitoring configuration
 */
export const HEALTH_CONFIG = {
  enabled: true,
  intervals: {
    fast: 30000,    // 30 seconds for unhealthy providers
    normal: 60000,  // 1 minute for healthy providers
    slow: 300000    // 5 minutes for temporarily disabled providers
  },
  thresholds: {
    maxLatency: 10000,    // 10 seconds max acceptable latency
    maxErrorRate: 0.1,    // 10% max error rate
    consecutiveFailures: 3 // Auto-disable after 3 consecutive failures
  },
  alerts: {
    enabled: true,
    webhookUrl: process.env.HEALTH_WEBHOOK_URL,
    email: process.env.HEALTH_EMAIL
  }
};

/**
 * Get failover chain configuration
 */
export function getFailoverChain(chainName = "main-chain") {
  return FAILOVER_CONFIG.chains[chainName] || FAILOVER_CONFIG.chains["ollama-only"];
}

/**
 * Check if failover is configured
 */
export function isFailoverEnabled() {
  return process.env.FAILOVER_ENABLED !== "false" && 
         Object.keys(FAILOVER_CONFIG.chains).length > 0;
}

/**
 * Get health monitoring configuration
 */
export function getHealthConfig() {
  return HEALTH_CONFIG;
}

/**
 * Validate provider configuration
 */
export function validateProviderConfig(providerName, config) {
  const requiredConfigs = {
    ollama: ["baseUrl", "model"],
    "ollama-cloud": ["baseUrl", "model"],
    zai: ["baseUrl", "model", "apiKey"],
    anthropic: ["apiKey", "model"],
    openai: ["apiKey", "model"]
  };
  
  const required = requiredConfigs[providerName];
  if (!required) {
    return true; // Unknown provider, allow configuration
  }
  
  for (const field of required) {
    if (!config[field]) {
      throw new Error(`Provider '${providerName}' requires '${field}' configuration`);
    }
  }
  
  return true;
}

/**
 * Validate provider configuration asynchronously (for import usage)
 */
export async function validateProviderConfigAsync(providerName, config) {
  return validateProviderConfig(providerName, config);
}

export default {
  FAILOVER_CONFIG,
  HEALTH_CONFIG,
  getFailoverChain,
  isFailoverEnabled,
  getHealthConfig,
  validateProviderConfig
};