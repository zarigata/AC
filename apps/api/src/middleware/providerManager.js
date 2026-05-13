/**
 * Provider Manager - Handles provider configuration, failover chains, and provider status
 */

import {
  getProviderReadinessSummary,
  listProviderConnections,
  listProviders,
  providerStatusValues,
  providerCategoryValues,
  providerReadinessValues,
  firstWaveProviderIds,
  providerCatalog
} from "../shared/simpleShared.js";

// The imported functions are already available - no need to redefine them

import { createFailoverChain } from "../adapters/failover.js";
import { FAILOVER_CONFIG, isFailoverEnabled, getFailoverChain } from "../config/failoverConfig.js";

// Multi-provider setup — primary is Ollama (local), fallbacks configured via env
const providers = {};
const providerNames = ["ollama", "openai", "anthropic", "gemini", "openrouter", "groq", "together", "lmstudio"];
const DEFAULT_PROVIDER = process.env.DEFAULT_PROVIDER || "ollama";

// Failover chain configuration
const failoverChains = {};
let DEFAULT_FAILOVER_CHAIN = process.env.DEFAULT_FAILOVER_CHAIN || "default";

/**
 * Initialize failover chains with enhanced health monitoring
 */
export const initFailoverChains = () => {
  // Use failover configuration if available and enabled
  if (isFailoverEnabled() && FAILOVER_CONFIG.chains) {
    console.log('Initializing failover chains from configuration...');
    
    // Initialize each configured failover chain
    for (const [chainName, chainConfig] of Object.entries(FAILOVER_CONFIG.chains)) {
      try {
        // Validate chain configuration
        if (!chainConfig.chain || !Array.isArray(chainConfig.chain) || chainConfig.chain.length === 0) {
          throw new Error(`Invalid chain configuration for '${chainName}'`);
        }
        
        // Validate each provider in the chain
        for (const provider of chainConfig.chain) {
          if (!provider.name || !provider.config) {
            throw new Error(`Invalid provider configuration in chain '${chainName}'`);
          }
        }
        
        const failoverChain = createFailoverChain(chainConfig);
        failoverChains[chainName] = failoverChain;
        console.log(`✅ Initialized failover chain '${chainName}' with ${chainConfig.chain.length} providers`);
        
      } catch (err) {
        console.error(`❌ Failed to initialize failover chain '${chainName}':`, err.message);
      }
    }
    
    // Set default failover chain if specified
    if (FAILOVER_CONFIG.default) {
      DEFAULT_FAILOVER_CHAIN = FAILOVER_CONFIG.default;
      console.log(`📋 Default failover chain set to: ${DEFAULT_FAILOVER_CHAIN}`);
    }
  } else {
    console.log('⚠️  Failover disabled or no configuration available, using individual providers');
    
    // Auto-detect failover chain from available providers
    const availableProviders = [];
    
    // Always add ollama as primary if available
    if (providers.ollama) {
      availableProviders.push({ name: 'ollama', config: { ...providers.ollama } });
    }
    
    // Add other providers if they have API keys configured
    for (const name of providerNames.slice(1)) {
      if (providers[name]) {
        availableProviders.push({ name, config: { ...providers[name] } });
      }
    }
    
    // Create a default failover chain if we have multiple providers
    if (availableProviders.length > 1) {
      try {
        const defaultChain = createFailoverChain({ chain: availableProviders });
        failoverChains[DEFAULT_FAILOVER_CHAIN] = defaultChain;
        console.log(`🔄 Auto-created default failover chain with ${availableProviders.length} providers`);
      } catch (err) {
        console.error('❌ Failed to auto-create failover chain:', err.message);
      }
    } else if (availableProviders.length === 1) {
      // Create a single-provider failover chain for consistency
      try {
        const singleChain = createFailoverChain({ chain: availableProviders });
        failoverChains[DEFAULT_FAILOVER_CHAIN] = singleChain;
        console.log(`🔧 Created single-provider failover chain with ${availableProviders.length} provider`);
      } catch (err) {
        console.error('❌ Failed to create single-provider failover chain:', err.message);
      }
    }
  }
};

/**
 * Initialize Ollama as primary with enhanced security validation
 */
export const initOllamaProvider = () => {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const ollamaModel = process.env.OLLAMA_MODEL || "qwen3:1.7b";
  const ollamaTimeout = parseInt(process.env.OLLAMA_TIMEOUT || "120000", 10);

  // Enhanced security validation for Ollama parameters
  if (!ollamaBaseUrl || typeof ollamaBaseUrl !== 'string' || ollamaBaseUrl.length > 2048) {
    throw new Error('Invalid OLLAMA_BASE_URL: must be a string between 1 and 2048 characters');
  }

  if (!ollamaModel || typeof ollamaModel !== 'string' || ollamaModel.length > 120) {
    throw new Error('Invalid OLLAMA_MODEL: must be a string between 1 and 120 characters');
  }

  if (isNaN(ollamaTimeout) || ollamaTimeout < 1000 || ollamaTimeout > 300000) {
    throw new Error('Invalid OLLAMA_TIMEOUT: must be a number between 1000 and 300000 milliseconds');
  }

  return {
    baseUrl: ollamaBaseUrl,
    model: ollamaModel,
    timeout: ollamaTimeout
  };
};

/**
 * Initialize all providers
 */
export const initializeProviders = async () => {
  // Initialize Ollama as primary
  try {
    const ollamaConfig = initOllamaProvider();
    const { OllamaAdapter } = await import('../adapters/ollama.js');
    providers.ollama = new OllamaAdapter(ollamaConfig);
    console.log(`Ollama provider initialized with model ${ollamaConfig.model}`);
  } catch (e) {
    console.error(`Failed to init Ollama provider: ${e.message}`);
  }

  // Lazy-init other providers (only when API key is set)
  for (const name of providerNames.slice(1)) {
    const envKey = name.toUpperCase() + "_API_KEY";
    if (process.env[envKey]) {
      try {
        const { createProvider } = await import('../adapters/ollama.js');
        providers[name] = createProvider(name);
        console.log(`${name} provider initialized`);
      } catch (e) {
        console.warn(`Failed to init provider ${name}: ${e.message}`);
      }
    }
  }
  
  // Initialize failover chains
  initFailoverChains();
  
  return providers;
};

/**
 * Keep 'ollama' reference for backward compatibility
 */
export const getOllamaProvider = () => {
  return providers.ollama;
};

/**
 * Check if a provider is part of any failover chain
 */
export const isProviderInFailoverChain = (providerName) => {
  for (const chainName of Object.keys(failoverChains)) {
    const chain = failoverChains[chainName];
    for (const providerConfig of chain.failoverChain) {
      if (providerConfig.name === providerName) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Get provider with failover support
 */
export const getProvider = (providerName = DEFAULT_PROVIDER) => {
  // First check if it's a failover chain
  if (failoverChains[providerName]) {
    return failoverChains[providerName];
  }
  
  // Fallback to individual provider
  return providers[providerName];
};

/**
 * Get provider summary
 */
export const providerSummary = () => {
  const staticProviders = listProviders();
  return {
    providers: staticProviders,
    configured: Object.keys(providers),
    default: DEFAULT_PROVIDER,
    summary: {
      total: staticProviders.length,
      local: staticProviders.filter((p) => p.category === "local").length,
      cloud: staticProviders.filter((p) => p.category === "cloud").length,
      selfHosted: staticProviders.filter((p) => p.category === "self-hosted").length,
      routers: staticProviders.filter((p) => p.category === "router").length
    },
    readiness: getProviderReadinessSummary(process.env),
    failoverChains: Object.keys(failoverChains),
    providersInFailover: Object.keys(providers).filter(name => isProviderInFailoverChain(name))
  };
};

/**
 * Test provider connection
 */
export const testProviderConnection = async (providerName) => {
  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Provider ${providerName} not found`);
  }
  
  try {
    // Use a simple test that most providers should support
    const result = await provider.testConnection();
    return {
      success: true,
      provider: providerName,
      message: 'Connection successful',
      details: result
    };
  } catch (error) {
    return {
      success: false,
      provider: providerName,
      message: 'Connection failed',
      error: error.message
    };
  }
};

/**
 * Test all provider connections
 */
export const testAllProviderConnections = async () => {
  const results = {};
  
  // Test individual providers
  for (const [name, provider] of Object.entries(providers)) {
    results[name] = await testProviderConnection(name);
  }
  
  // Test failover chains
  for (const [name, chain] of Object.entries(failoverChains)) {
    try {
      const result = await chain.testConnection();
      results[name] = {
        success: true,
        provider: name,
        type: 'failover_chain',
        message: 'Connection successful',
        details: result
      };
    } catch (error) {
      results[name] = {
        success: false,
        provider: name,
        type: 'failover_chain',
        message: 'Connection failed',
        error: error.message
      };
    }
  }
  
  return results;
};

/**
 * Get provider health status
 */
export const getProviderHealth = () => {
  const health = {
    timestamp: Date.now(),
    providers: {},
    failoverChains: {},
    summary: {
      totalProviders: Object.keys(providers).length,
      totalFailoverChains: Object.keys(failoverChains).length,
      healthyProviders: 0,
      healthyFailoverChains: 0,
      unhealthyProviders: 0,
      unhealthyFailoverChains: 0
    }
  };
  
  // Check individual providers
  for (const [name, provider] of Object.entries(providers)) {
    try {
      const isHealthy = provider.isHealthy?.() ?? true; // Assume healthy if no health check
      health.providers[name] = {
        healthy: isHealthy,
        type: 'individual',
        lastChecked: Date.now()
      };
      
      if (isHealthy) {
        health.summary.healthyProviders++;
      } else {
        health.summary.unhealthyProviders++;
      }
    } catch (error) {
      health.providers[name] = {
        healthy: false,
        type: 'individual',
        error: error.message,
        lastChecked: Date.now()
      };
      health.summary.unhealthyProviders++;
    }
  }
  
  // Check failover chains
  for (const [name, chain] of Object.entries(failoverChains)) {
    try {
      const isHealthy = chain.isHealthy?.() ?? true;
      health.failoverChains[name] = {
        healthy: isHealthy,
        type: 'failover_chain',
        lastChecked: Date.now()
      };
      
      if (isHealthy) {
        health.summary.healthyFailoverChains++;
      } else {
        health.summary.unhealthyFailoverChains++;
      }
    } catch (error) {
      health.failoverChains[name] = {
        healthy: false,
        type: 'failover_chain',
        error: error.message,
        lastChecked: Date.now()
      };
      health.summary.unhealthyFailoverChains++;
    }
  }
  
  return health;
};

/**
 * Provider configuration constants
 */
export const PROVIDER_CONFIG = {
  OLLAMA: {
    defaultModel: "qwen3",
    defaultTimeout: 120000,
    baseUrl: "http://127.0.0.1:11434",
    maxRetries: 3,
    retryDelay: 1000
  },
  OPENAI: {
    defaultTimeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    models: ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"]
  },
  ANTHROPIC: {
    defaultTimeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    models: ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"]
  }
};

/**
 * Validate provider configuration
 */
export const validateProviderConfig = (providerName, config) => {
  if (!providerName || typeof providerName !== 'string') {
    throw new Error('Provider name must be a string');
  }
  
  if (!config || typeof config !== 'object') {
    throw new Error('Provider configuration must be an object');
  }
  
  switch (providerName.toLowerCase()) {
    case 'ollama':
      if (!config.baseUrl || typeof config.baseUrl !== 'string') {
        throw new Error('Ollama provider requires baseUrl');
      }
      if (!config.model || typeof config.model !== 'string') {
        throw new Error('Ollama provider requires model');
      }
      break;
      
    case 'openai':
    case 'anthropic':
    case 'gemini':
      if (!config.apiKey || typeof config.apiKey !== 'string') {
        throw new Error(`${providerName} provider requires apiKey`);
      }
      break;
      
    default:
      console.warn(`Unknown provider type: ${providerName}`);
  }
  
  return true;
};

export default {
  providers,
  failoverChains,
  DEFAULT_PROVIDER,
  DEFAULT_FAILOVER_CHAIN,
  initializeProviders,
  getProvider,
  getOllamaProvider,
  providerSummary,
  testProviderConnection,
  testAllProviderConnections,
  getProviderHealth,
  validateProviderConfig,
  initFailoverChains,
  isProviderInFailoverChain
};