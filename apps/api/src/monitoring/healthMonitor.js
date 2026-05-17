/**
 * Provider Health Monitor - Real-time connectivity and health monitoring
 */

import { createHash } from 'node:crypto';

/**
 * Health monitoring configuration
 */
const HEALTH_CONFIG = {
  // Check intervals (in milliseconds)
  intervals: {
    ollama: 30 * 1000,     // 30 seconds
    openai: 60 * 1000,     // 1 minute
    default: 45 * 1000     // 45 seconds
  },
  
  // Timeouts for health checks
  timeouts: {
    ollama: 10 * 1000,     // 10 seconds
    openai: 15 * 1000,     // 15 seconds
    default: 12 * 1000     // 12 seconds
  },
  
  // Retry configuration
  retries: {
    maxRetries: 3,
    retryDelay: 5 * 1000,  // 5 seconds between retries
    backoffMultiplier: 2
  },
  
  // Health status thresholds
  thresholds: {
    healthy: {
      maxLatency: 1000,     // 1 second
      maxErrorRate: 0.05    // 5% error rate
    },
    degraded: {
      maxLatency: 3000,     // 3 seconds
      maxErrorRate: 0.15    // 15% error rate
    }
  }
};

/**
 * Health status tracking
 */
class ProviderHealth {
  constructor(providerName) {
    this.providerName = providerName;
    this.status = 'unknown';
    this.lastCheck = null;
    this.lastHealthy = null;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.latency = 0;
    this.errorRate = 0;
    this.totalChecks = 0;
    this.successfulChecks = 0;
    this.totalLatency = 0;
    this.recentChecks = []; // Store recent check results
    this.maxRecentChecks = 20;
  }
  
  /**
   * Update health status based on check result
   */
  updateCheckResult(success, latency = 0, error = null) {
    const now = Date.now();
    this.lastCheck = now;
    this.totalChecks++;
    
    if (success) {
      this.successfulChecks++;
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;
      
      if (this.status !== 'healthy') {
        this.status = 'healthy';
        this.lastHealthy = now;
      }
    } else {
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;
      
      // Determine status based on consecutive failures
      if (this.consecutiveFailures >= 3) {
        this.status = 'unhealthy';
      } else if (this.consecutiveFailures >= 1) {
        this.status = 'degraded';
      }
    }
    
    // Update latency tracking
    this.latency = latency;
    this.totalLatency += latency;
    
    // Calculate error rate
    this.errorRate = this.totalChecks > 0 ? 
      (this.totalChecks - this.successfulChecks) / this.totalChecks : 0;
    
    // Store recent check result
    this.recentChecks.push({
      timestamp: now,
      success,
      latency,
      error: error ? error.message : null
    });
    
    // Keep only recent checks
    if (this.recentChecks.length > this.maxRecentChecks) {
      this.recentChecks = this.recentChecks.slice(-this.maxRecentChecks);
    }
  }
  
  /**
   * Get health status with thresholds
   */
  getHealthStatus() {
    const thresholds = HEALTH_CONFIG.thresholds;
    
    if (this.status === 'unhealthy') {
      return 'unhealthy';
    }
    
    if (this.latency > thresholds.degraded.maxLatency || 
        this.errorRate > thresholds.degraded.maxErrorRate) {
      return 'degraded';
    }
    
    if (this.latency > thresholds.healthy.maxLatency || 
        this.errorRate > thresholds.healthy.maxErrorRate) {
      return 'degraded';
    }
    
    return 'healthy';
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return {
      status: this.getHealthStatus(),
      lastCheck: this.lastCheck,
      lastHealthy: this.lastHealthy,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      latency: this.latency,
      errorRate: this.errorRate,
      totalChecks: this.totalChecks,
      successfulChecks: this.successfulChecks,
      averageLatency: this.totalChecks > 0 ? this.totalLatency / this.totalChecks : 0,
      recentFailures: this.recentChecks.filter(c => !c.success).length,
      uptime: this.calculateUptime()
    };
  }
  
  /**
   * Calculate uptime percentage
   */
  calculateUptime() {
    if (this.recentChecks.length === 0) return 0;
    
    const recentSuccessful = this.recentChecks.filter(c => c.success).length;
    return (recentSuccessful / this.recentChecks.length) * 100;
  }
}

/**
 * Health Monitor Class
 */
export class HealthMonitor {
  constructor(registry) {
    this.registry = registry;
    this.providers = new Map();
    this.monitoringInterval = null;
    this.isRunning = false;
    this.healthCallbacks = new Set();
    
    // Initialize provider health trackers
    this.initializeProviders();
  }
  
  /**
   * Initialize provider health trackers
   */
  initializeProviders() {
    // Get available providers from registry or settings
    const availableProviders = ['ollama', 'openai']; // Add more as needed
    
    for (const providerName of availableProviders) {
      this.providers.set(providerName, new ProviderHealth(providerName));
    }
  }
  
  /**
   * Start health monitoring
   */
  start() {
    if (this.isRunning) return;
    
    console.log('🚀 Starting provider health monitoring...');
    this.isRunning = true;
    
    // Start monitoring intervals for each provider
    for (const [providerName, health] of this.providers) {
      const interval = HEALTH_CONFIG.intervals[providerName] || HEALTH_CONFIG.intervals.default;
      this.scheduleHealthCheck(providerName, interval);
    }
    
    console.log(`📊 Health monitor started for ${this.providers.size} providers`);
  }
  
  /**
   * Stop health monitoring
   */
  stop() {
    if (!this.isRunning) return;
    
    console.log('🛑 Stopping provider health monitoring...');
    this.isRunning = false;
    
    // Clear all intervals
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.providers.clear();
    this.healthCallbacks.clear();
  }
  
  /**
   * Schedule health check for a provider
   */
  scheduleHealthCheck(providerName, interval) {
    const check = () => {
      if (!this.isRunning) return;
      
      // Perform the async health check
      this.checkProviderHealth(providerName).catch(error => {
        console.error(`Health check failed for ${providerName}:`, error.message);
      });
      
      // Schedule next check
      if (this.isRunning) {
        const nextInterval = HEALTH_CONFIG.intervals[providerName] || HEALTH_CONFIG.intervals.default;
        setTimeout(check, nextInterval);
      }
    };
    
    // Start first check immediately
    check();
  }
  
  /**
   * Check health of a specific provider
   */
  async checkProviderHealth(providerName) {
    const health = this.providers.get(providerName);
    if (!health) {
      console.warn(`Unknown provider: ${providerName}`);
      return;
    }
    
    const startTime = Date.now();
    let success = false;
    let latency = 0;
    let error = null;
    
    try {
      // Perform actual health check based on provider type
      switch (providerName) {
        case 'ollama':
          success = await this.checkOllamaHealth();
          break;
        case 'openai':
          success = await this.checkOpenAIHealth();
          break;
        default:
          success = await this.checkGenericHealth(providerName);
      }
      
      latency = Date.now() - startTime;
      
      // Log the result
      console.log(`🏥 Health check for ${providerName}: ${success ? '✅' : '❌'} (${latency}ms)`);
      
    } catch (err) {
      success = false;
      error = err;
      latency = Date.now() - startTime;
      console.error(`❌ Health check failed for ${providerName}:`, err.message);
    }
    
    // Update health status
    health.updateCheckResult(success, latency, error);
    
    // Notify callbacks if status changed
    this.notifyHealthChange(providerName, health);
    
    return { success, latency, error: error ? error.message : null };
  }
  
  /**
   * Check Ollama provider health
   */
  async checkOllamaHealth() {
    try {
      const { createProvider } = await import('../adapters/ollama.js');
      const ollama = createProvider('ollama');
      
      if (!ollama) {
        throw new Error('Ollama provider not available');
      }
      
      // Test basic connectivity with a simple model list
      const models = await ollama.listModels();
      
      if (!models || models.length === 0) {
        throw new Error('No models available');
      }
      
      return true;
      
    } catch (error) {
      console.error('Ollama health check failed:', error.message);
      return false;
    }
  }
  
  /**
   * Check OpenAI provider health
   */
  async checkOpenAIHealth() {
    try {
      const { createProvider } = await import('../adapters/openai.js');
      const openai = createProvider('openai');
      
      if (!openai) {
        throw new Error('OpenAI provider not available');
      }
      
      // Test basic connectivity with a simple model list
      const models = await openai.listModels();
      
      // OpenAI might not return models in some configurations, so just test connection
      return models !== undefined;
      
    } catch (error) {
      console.error('OpenAI health check failed:', error.message);
      return false;
    }
  }
  
  /**
   * Check generic provider health
   */
  async checkGenericHealth(providerName) {
    try {
      const { createProvider } = await import('../adapters/factory.js');
      const provider = createProvider(providerName);
      
      if (!provider) {
        throw new Error(`${providerName} provider not available`);
      }
      
      // Try to get a basic response
      const testResponse = await provider.chat([
        { role: 'system', content: 'test' },
        { role: 'user', content: 'ping' }
      ], { maxTokens: 1 });
      
      return !!testResponse;
      
    } catch (error) {
      console.error(`${providerName} health check failed:`, error.message);
      return false;
    }
  }
  
  /**
   * Add health change callback
   */
  onHealthChange(callback) {
    this.healthCallbacks.add(callback);
  }
  
  /**
   * Remove health change callback
   */
  removeHealthChangeCallback(callback) {
    this.healthCallbacks.delete(callback);
  }
  
  /**
   * Notify all callbacks of health status change
   */
  notifyHealthChange(providerName, health) {
    const changeEvent = {
      provider: providerName,
      status: health.getHealthStatus(),
      timestamp: Date.now(),
      previousStatus: health.status,
      latency: health.latency,
      errorRate: health.errorRate
    };
    
    for (const callback of this.healthCallbacks) {
      try {
        callback(changeEvent);
      } catch (error) {
        console.error('Health change callback error:', error);
      }
    }
  }
  
  /**
   * Get health status for all providers
   */
  getProviderHealth() {
    const healthStatus = {};
    
    for (const [providerName, health] of this.providers) {
      healthStatus[providerName] = {
        status: health.getHealthStatus(),
        lastCheck: health.lastCheck,
        latency: health.latency,
        errorRate: health.errorRate,
        stats: health.getStats()
      };
    }
    
    return healthStatus;
  }
  
  /**
   * Get overall system health
   */
  getSystemHealth() {
    const providerHealth = this.getProviderHealth();
    const providerCounts = {
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0
    };
    
    for (const [_, health] of Object.entries(providerHealth)) {
      providerCounts[health.status]++;
    }
    
    // Determine overall system health
    let overallStatus = 'healthy';
    if (providerCounts.unhealthy > 0) {
      overallStatus = 'unhealthy';
    } else if (providerCounts.degraded > 0) {
      overallStatus = 'degraded';
    } else if (providerCounts.healthy === 0) {
      overallStatus = 'unknown';
    }
    
    return {
      status: overallStatus,
      providers: providerHealth,
      summary: providerCounts,
      timestamp: Date.now()
    };
  }
  
  /**
   * Get provider recommendations based on health
   */
  getProviderRecommendations() {
    const healthStatus = this.getProviderHealth();
    const recommendations = [];
    
    for (const [providerName, health] of Object.entries(healthStatus)) {
      if (health.status === 'unhealthy') {
        recommendations.push({
          provider: providerName,
          action: 'avoid',
          reason: 'Provider is unhealthy',
          priority: 'high'
        });
      } else if (health.status === 'degraded') {
        recommendations.push({
          provider: providerName,
          action: 'monitor',
          reason: 'Provider performance degraded',
          priority: 'medium'
        });
      } else if (health.status === 'healthy' && health.latency > 500) {
        recommendations.push({
          provider: providerName,
          action: 'consider_alternative',
          reason: `High latency (${health.latency}ms)`,
          priority: 'low'
        });
      }
    }
    
    return recommendations;
  }
}

// Export health config for reference
export { HEALTH_CONFIG };

// Create singleton instance for server-wide use
let globalHealthMonitor = null;

export function createHealthMonitor(registry) {
  if (!globalHealthMonitor) {
    globalHealthMonitor = new HealthMonitor(registry);
  }
  return globalHealthMonitor;
}

export function getGlobalHealthMonitor() {
  return globalHealthMonitor;
}