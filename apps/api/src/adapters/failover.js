import { OllamaAdapter, OpenAIAdapter, AnthropicAdapter, GeminiAdapter, OpenRouterAdapter, createProvider } from './ollama.js';

/**
 * Failover Chain Adapter - tries multiple providers in sequence
 * Creates a resilient system that falls back to alternate providers when the primary fails
 */
export class FailoverChainAdapter {
  constructor(failoverChain = [], config = {}) {
    if (!Array.isArray(failoverChain) || failoverChain.length === 0) {
      throw new Error('Failover chain must be a non-empty array');
    }
    
    this.failoverChain = failoverChain;
    this.config = config;
    this.providers = [];
    this.currentProviderIndex = 0;
    this.lastProviderUsed = -1;
    this.healthCache = new Map();
    this.healthCacheTTL = config.healthCacheTTL || 30000; // 30 seconds cache
    this.lastHealthCheck = new Map();
    
    // Initialize providers
    this._initializeProviders();
  }

  _initializeProviders() {
    for (const providerConfig of this.failoverChain) {
      try {
        const provider = createProvider(providerConfig.name, {
          ...providerConfig.config,
          ...this.config
        });
        this.providers.push(provider);
      } catch (error) {
        console.warn(`Failed to initialize provider ${providerConfig.name}:`, error.message);
        // Continue with other providers
      }
    }
    
    if (this.providers.length === 0) {
      throw new Error('No valid providers could be initialized');
    }
  }

  _getHealthCacheKey(providerIndex) {
    return `${providerIndex}-${this.failoverChain[providerIndex]?.name || 'unknown'}`;
  }

  async _isProviderHealthy(providerIndex) {
    const cacheKey = this._getHealthCacheKey(providerIndex);
    const now = Date.now();
    const cached = this.healthCache.get(cacheKey);
    
    // Return cached result if still valid
    if (cached && now - cached.timestamp < this.healthCacheTTL) {
      return cached.isHealthy;
    }
    
    try {
      const provider = this.providers[providerIndex];
      if (!provider || typeof provider.health !== 'function') {
        // Mark as unhealthy and cache result
        this.healthCache.set(cacheKey, {
          isHealthy: false,
          timestamp: now
        });
        return false;
      }
      
      // Perform health check with timeout
      const healthPromise = provider.health();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), 5000);
      });
      
      const healthResult = await Promise.race([healthPromise, timeoutPromise]);
      const isHealthy = healthResult && healthResult.ok === true;
      
      // Cache result
      this.healthCache.set(cacheKey, {
        isHealthy,
        timestamp: now
      });
      
      return isHealthy;
    } catch (error) {
      // Mark as unhealthy and cache result
      this.healthCache.set(cacheKey, {
        isHealthy: false,
        timestamp: now
      });
      return false;
    }
  }

  async _getNextHealthyProvider(startIndex = 0) {
    // First, check if current provider is still healthy
    for (let i = startIndex; i < this.providers.length; i++) {
      const isHealthy = await this._isProviderHealthy(i);
      if (isHealthy) {
        return i;
      }
    }
    
    // If none are healthy, try all providers again (health cache might be stale)
    this.healthCache.clear(); // Clear cache to force fresh checks
    for (let i = startIndex; i < this.providers.length; i++) {
      const isHealthy = await this._isProviderHealthy(i);
      if (isHealthy) {
        return i;
      }
    }
    
    // If still none are healthy, return the first provider for a last attempt
    return 0;
  }

  async chat(messages, options = {}) {
    let lastError = null;
    const startTime = Date.now();
    
    // Try providers in failover order
    for (let attempt = 0; attempt < this.providers.length; attempt++) {
      const providerIndex = await this._getNextHealthyProvider(this.currentProviderIndex);
      const provider = this.providers[providerIndex];
      
      try {
        const result = await provider.chat(messages, options);
        
        // Update tracking
        this.lastProviderUsed = providerIndex;
        this.currentProviderIndex = providerIndex;
        
        // Add provider name to result for debugging
        return {
          ...result,
          provider: this.failoverChain[providerIndex]?.name || 'unknown',
          failoverAttempts: attempt + 1,
          duration: Date.now() - startTime
        };
      } catch (error) {
        lastError = error;
        console.warn(`Provider ${this.failoverChain[providerIndex]?.name || 'unknown'} failed:`, error.message);
        
        // Mark provider as unhealthy in cache
        const cacheKey = this._getHealthCacheKey(providerIndex);
        this.healthCache.set(cacheKey, {
          isHealthy: false,
          timestamp: Date.now()
        });
        
        // Try next provider
        continue;
      }
    }
    
    // If we get here, all providers failed
    throw new Error(`All providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  async chatStream(messages, options = {}, onChunk, onComplete) {
    let lastError = null;
    const startTime = Date.now();
    
    // Try providers in failover order
    for (let attempt = 0; attempt < this.providers.length; attempt++) {
      const providerIndex = await this._getNextHealthyProvider(this.currentProviderIndex);
      const provider = this.providers[providerIndex];
      
      try {
        let accumulatedContent = "";
        let accumulatedTokensIn = 0;
        let accumulatedTokensOut = 0;
        
        await provider.chatStream(messages, options, (chunk) => {
          accumulatedContent += chunk.content || "";
          accumulatedTokensIn += chunk.tokensIn || 0;
          accumulatedTokensOut += chunk.tokensOut || 0;
          
          // Forward chunk to callback with additional metadata
          onChunk({
            ...chunk,
            provider: this.failoverChain[providerIndex]?.name || 'unknown',
            accumulatedContent,
            accumulatedTokensIn,
            accumulatedTokensOut,
            failoverAttempts: attempt + 1
          });
        }, (finalResult) => {
          // Update tracking
          this.lastProviderUsed = providerIndex;
          this.currentProviderIndex = providerIndex;
          
          // Forward final result with additional metadata
          onComplete({
            ...finalResult,
            provider: this.failoverChain[providerIndex]?.name || 'unknown',
            accumulatedContent: accumulatedContent || finalResult.content || "",
            accumulatedTokensIn: accumulatedTokensIn || finalResult.tokensIn || 0,
            accumulatedTokensOut: accumulatedTokensOut || finalResult.tokensOut || 0,
            failoverAttempts: attempt + 1,
            duration: Date.now() - startTime
          });
        });
        
        return; // Success, exit the loop
        
      } catch (error) {
        lastError = error;
        console.warn(`Provider ${this.failoverChain[providerIndex]?.name || 'unknown'} failed in stream:`, error.message);
        
        // Mark provider as unhealthy in cache
        const cacheKey = this._getHealthCacheKey(providerIndex);
        this.healthCache.set(cacheKey, {
          isHealthy: false,
          timestamp: Date.now()
        });
        
        // Try next provider
        continue;
      }
    }
    
    // If we get here, all providers failed
    throw new Error(`All providers failed in stream. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  async health() {
    const results = {};
    let allHealthy = true;
    
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      const providerName = this.failoverChain[i]?.name || 'unknown';
      
      try {
        // Use cached health if available
        const isHealthy = await this._isProviderHealthy(i);
        results[providerName] = {
          ok: isHealthy,
          name: providerName,
          index: i,
          position: i + 1,
          lastUsed: this.lastProviderUsed === i ? Date.now() : null,
          current: this.currentProviderIndex === i
        };
        
        if (!isHealthy) {
          allHealthy = false;
        }
      } catch (error) {
        results[providerName] = {
          ok: false,
          name: providerName,
          index: i,
          error: error.message
        };
        allHealthy = false;
      }
    }
    
    return {
      ok: allHealthy,
      provider: 'failover-chain',
      healthy: allHealthy,
      providers: results,
      primary: this.failoverChain[this.currentProviderIndex]?.name || 'unknown',
      fallbackCount: this.providers.length - 1
    };
  }

  // Method to get current provider info
  getCurrentProvider() {
    if (this.providers.length === 0) {
      return null;
    }
    return {
      name: this.failoverChain[this.currentProviderIndex]?.name || 'unknown',
      index: this.currentProviderIndex,
      lastUsed: this.lastProviderUsed,
      config: this.failoverChain[this.currentProviderIndex]?.config
    };
  }

  // Method to manually switch to a specific provider
  async setProvider(index) {
    if (index < 0 || index >= this.providers.length) {
      throw new Error(`Invalid provider index: ${index}`);
    }
    
    const isHealthy = await this._isProviderHealthy(index);
    if (!isHealthy) {
      throw new Error(`Provider at index ${index} is not healthy`);
    }
    
    this.currentProviderIndex = index;
    this.lastProviderUsed = index;
    return this.getCurrentProvider();
  }

  // Method to add a provider to the chain
  addProvider(providerConfig, position = -1) {
    if (!providerConfig || !providerConfig.name) {
      throw new Error('Provider configuration must include a name');
    }
    
    try {
      const provider = createProvider(providerConfig.name, {
        ...providerConfig.config,
        ...this.config
      });
      
      const insertIndex = position === -1 ? this.failoverChain.length : position;
      this.failoverChain.splice(insertIndex, 0, providerConfig);
      this.providers.splice(insertIndex, 0, provider);
      
      // Update current provider index if needed
      if (insertIndex <= this.currentProviderIndex) {
        this.currentProviderIndex++;
      }
      
      return true;
    } catch (error) {
      console.warn(`Failed to add provider ${providerConfig.name}:`, error.message);
      return false;
    }
  }

  // Method to remove a provider from the chain
  removeProvider(index) {
    if (index < 0 || index >= this.providers.length) {
      throw new Error(`Invalid provider index: ${index}`);
    }
    
    this.failoverChain.splice(index, 1);
    this.providers.splice(index, 1);
    
    // Adjust current provider index
    if (this.currentProviderIndex >= index && this.currentProviderIndex > 0) {
      this.currentProviderIndex--;
    }
    
    if (this.lastProviderUsed >= index && this.lastProviderUsed > 0) {
      this.lastProviderUsed--;
    }
    
    return true;
  }

  // Method to update provider configuration
  updateProvider(index, newConfig) {
    if (index < 0 || index >= this.providers.length) {
      throw new Error(`Invalid provider index: ${index}`);
    }
    
    try {
      const provider = createProvider(this.failoverChain[index].name, {
        ...this.failoverChain[index].config,
        ...newConfig,
        ...this.config
      });
      
      this.failoverChain[index].config = { ...this.failoverChain[index].config, ...newConfig };
      this.providers[index] = provider;
      
      return true;
    } catch (error) {
      console.warn(`Failed to update provider at index ${index}:`, error.message);
      return false;
    }
  }
}

/**
 * Factory function to create a failover chain from configuration
 */
export function createFailoverChain(failoverConfig) {
  if (!failoverConfig || !Array.isArray(failoverConfig.chain)) {
    throw new Error('Invalid failover configuration');
  }
  
  return new FailoverChainAdapter(failoverConfig.chain, failoverConfig.config || {});
}