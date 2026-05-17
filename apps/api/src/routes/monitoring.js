/**
 * System Monitoring Routes - Real-time system health, metrics, and monitoring endpoints
 */

import { applyRateLimit } from "../middleware/security.js";
import { 
  getConnectedClients, 
  activeConnections, 
  totalActiveConnections, 
  getActiveTasks,
  messageTimestamps,
  totalActiveTasks 
} from "../middleware/webSocketHandler.js";
import { serverState, settings, getServerStatus } from "../config/serverConfig.js";

/**
 * System metrics collector
 */
const collectSystemMetrics = () => {
  const now = Date.now();
  const uptime = Math.floor((now - serverState.startTime) / 1000);
  
  // Calculate memory usage
  const memoryUsage = process.memoryUsage();
  const memoryMB = {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024)
  };
  
  // Calculate WebSocket message rates
  const messageRates = {};
  for (const [clientKey, timestamps] of Object.entries(messageTimestamps)) {
    const oneMinuteAgo = now - 60000;
    const recentMessages = timestamps.filter(ts => ts > oneMinuteAgo);
    messageRates[clientKey] = recentMessages.length;
  }
  
  // Get system load (if available)
  const loadAvg = process.loadavg ? process.loadavg() : [0, 0, 0];
  
  return {
    timestamp: now,
    uptime,
    memory: memoryMB,
    connections: {
      total: totalActiveConnections,
      websocket: totalActiveConnections,
      byIp: getConnectionsByIp()
    },
    tasks: {
      active: getActiveTasks().length,
      total: totalActiveTasks || 0,
      byType: getTasksByType()
    },
    messages: {
      rates: messageRates,
      totalClients: Object.keys(messageRates).length
    },
    system: {
      load: loadAvg,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    },
    providers: settings.providers,
    maxAgents: settings.maxAgents,
    version: settings.version
  };
};

/**
 * Get connections grouped by IP address
 */
const getConnectionsByIp = () => {
  const connectionsByIp = {};
  
  for (const [_, connection] of activeConnections.entries()) {
    const ip = connection.ip || 'unknown';
    if (!connectionsByIp[ip]) {
      connectionsByIp[ip] = {
        count: 0,
        userAgent: connection.userAgent || 'unknown',
        firstSeen: connection.startTime || Date.now()
      };
    }
    connectionsByIp[ip].count++;
  }
  
  return connectionsByIp;
};

/**
 * Get tasks grouped by type
 */
const getTasksByType = () => {
  const tasksByType = {};
  
  for (const task of getActiveTasks()) {
    if (!tasksByType[task.type]) {
      tasksByType[task.type] = 0;
    }
    tasksByType[task.type]++;
  }
  
  return tasksByType;
};

/**
 * Handle system health check endpoint
 */
export const handleSystemHealth = async (request, response, registry) => {
  if (request.method !== 'GET' || request.url !== '/api/monitoring/health') {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    // Get basic server status
    const status = getServerStatus();
    
    // Check database connectivity
    let databaseStatus = 'unknown';
    let databaseLatency = 0;
    try {
      const startTime = Date.now();
      // Simple database query to test connectivity
      const testResult = registry.db.prepare("SELECT 1 as test").get();
      databaseLatency = Date.now() - startTime;
      databaseStatus = testResult.test === 1 ? 'healthy' : 'error';
    } catch (dbError) {
      databaseStatus = 'error';
      databaseLatency = 0;
    }
    
    // Check provider connectivity
    const providerStatus = checkProviderConnectivity();
    
    // Overall system health
    const isHealthy = status.uptime > 0 && 
                     databaseStatus === 'healthy' && 
                     Object.keys(providerStatus).every(p => providerStatus[p].status === 'healthy');
    
    const healthResponse = {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: Date.now(),
      components: {
        server: {
          status: status.uptime > 0 ? 'healthy' : 'down',
          uptime: status.uptime,
          latency: 0 // HTTP request latency
        },
        database: {
          status: databaseStatus,
          latency: databaseLatency
        },
        providers: providerStatus
      },
      metrics: collectSystemMetrics(),
      alerts: getSystemAlerts()
    };
    
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(healthResponse, null, 2));
    return true;
    
  } catch (error) {
    console.error('System health check error:', error);
    
    const errorResponse = {
      status: 'error',
      timestamp: Date.now(),
      error: error.message,
      components: {
        server: {
          status: 'error',
          uptime: Math.floor((Date.now() - serverState.startTime) / 1000)
        },
        database: {
          status: 'unknown',
          latency: 0
        },
        providers: {}
      }
    };
    
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(errorResponse, null, 2));
    return true;
  }
};

/**
 * Handle system metrics endpoint
 */
export const handleSystemMetrics = async (request, response, registry) => {
  if (request.method !== 'GET' || request.url !== '/api/monitoring/metrics') {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    const metrics = collectSystemMetrics();
    
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(metrics, null, 2));
    return true;
    
  } catch (error) {
    console.error('Metrics collection error:', error);
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: 'Failed to collect metrics' }));
    return true;
  }
};

/**
 * Handle WebSocket connections endpoint
 */
export const handleWebSocketConnections = async (request, response) => {
  if (request.method !== 'GET' || request.url !== '/api/monitoring/connections') {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    const connectionsInfo = {
      total: totalActiveConnections,
      byIp: getConnectionsByIp(),
      sessions: getSessionConnections(),
      timestamp: Date.now()
    };
    
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(connectionsInfo, null, 2));
    return true;
    
  } catch (error) {
    console.error('WebSocket connections error:', error);
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: 'Failed to get connections info' }));
    return true;
  }
};

/**
 * Get session connection information
 */
const getSessionConnections = () => {
  const sessionConnections = {};
  
  for (const [_, connection] of activeConnections.entries()) {
    if (connection.sessionId) {
      if (!sessionConnections[connection.sessionId]) {
        sessionConnections[connection.sessionId] = {
          agentId: connection.agentId || null,
          connections: 0,
          firstSeen: connection.startTime || Date.now()
        };
      }
      sessionConnections[connection.sessionId].connections++;
    }
  }
  
  return sessionConnections;
};

/**
 * Check provider connectivity
 */
const checkProviderConnectivity = () => {
  const providerStatus = {};
  
  // This would normally check actual provider connectivity
  // For now, return a mock status
  const mockProviders = ['ollama', 'openai'];
  
  for (const provider of mockProviders) {
    providerStatus[provider] = {
      status: 'healthy',
      latency: Math.floor(Math.random() * 100) + 50, // Mock latency
      lastCheck: Date.now()
    };
  }
  
  return providerStatus;
};

/**
 * Get system alerts
 */
const getSystemAlerts = () => {
  const alerts = [];
  const metrics = collectSystemMetrics();
  
  // Memory usage alerts
  if (metrics.memory.heapUsed > 500) { // 500MB
    alerts.push({
      type: 'warning',
      component: 'memory',
      message: 'High memory usage detected',
      value: `${metrics.memory.heapUsed}MB`,
      threshold: '500MB'
    });
  }
  
  // Connection count alerts
  if (metrics.connections.total > 50) { // 50 connections
    alerts.push({
      type: 'warning',
      component: 'connections',
      message: 'High number of active connections',
      value: metrics.connections.total,
      threshold: '50'
    });
  }
  
  // Task count alerts
  if (metrics.tasks.active > 20) { // 20 active tasks
    alerts.push({
      type: 'warning',
      component: 'tasks',
      message: 'High number of active tasks',
      value: metrics.tasks.active,
      threshold: '20'
    });
  }
  
  return alerts;
};

/**
 * Register monitoring routes
 */
export function registerMonitoringRoutes(server, registry, providers, failoverChains, settings) {
  // System health endpoint
  server.on('request', async (request, response) => {
    if (await handleSystemHealth(request, response, registry)) {
      return;
    }
    
    if (await handleSystemMetrics(request, response, registry)) {
      return;
    }
    
    if (await handleWebSocketConnections(request, response)) {
      return;
    }
    
    // If no monitoring handler matched, continue to other routes
    return false;
  });
}