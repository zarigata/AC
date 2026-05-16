/**
 * Comprehensive Alerting System - Monitor system health and send alerts when thresholds are exceeded
 */

import { serverState, settings } from "../config/serverConfig.js";
import { activeConnections, totalActiveConnections, getActiveTasks, totalActiveTasks } from "./webSocketHandler.js";

/**
 * Alert configuration and thresholds
 */
export const alertConfig = {
  // Memory thresholds (in MB)
  memory: {
    warning: 500,    // 500MB
    critical: 1000,  // 1GB
    checkInterval: 30000 // 30 seconds
  },
  
  // Connection thresholds
  connections: {
    warning: 50,     // 50 connections
    critical: 100,   // 100 connections
    checkInterval: 15000 // 15 seconds
  },
  
  // Task thresholds
  tasks: {
    warning: 20,     // 20 active tasks
    critical: 50,    // 50 active tasks
    checkInterval: 20000 // 20 seconds
  },
  
  // Response time thresholds (in ms)
  responseTime: {
    warning: 1000,   // 1 second
    critical: 5000,  // 5 seconds
    checkInterval: 25000 // 25 seconds
  },
  
  // Error rate thresholds (errors per minute)
  errorRate: {
    warning: 10,     // 10 errors per minute
    critical: 50,    // 50 errors per minute
    checkInterval: 60000 // 1 minute
  },
  
  // Database latency (in ms)
  database: {
    warning: 100,    // 100ms
    critical: 500,   // 500ms
    checkInterval: 20000 // 20 seconds
  }
};

/**
 * Alert levels
 */
export const AlertLevel = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

/**
 * Alert types
 */
export const AlertType = {
  MEMORY: 'memory',
  CONNECTIONS: 'connections',
  TASKS: 'tasks',
  RESPONSE_TIME: 'response_time',
  ERROR_RATE: 'error_rate',
  DATABASE: 'database',
  PROVIDER: 'provider'
};

/**
 * Active alerts storage
 */
const activeAlerts = new Map();
const alertHistory = [];
const maxAlertHistory = 1000;

/**
 * Alert statistics
 */
let alertStats = {
  total: 0,
  byLevel: {
    info: 0,
    warning: 0,
    critical: 0
  },
  byType: {}
};

/**
 * Initialize alerting system
 */
export const initializeAlertingSystem = () => {
  console.log('🚨 Initializing alerting system...');
  
  // Start periodic checks
  startPeriodicChecks();
  
  // Set up alert cleanup
  setInterval(cleanupOldAlerts, 5 * 60 * 1000); // Clean up every 5 minutes
  
  console.log('✅ Alerting system initialized');
};

/**
 * Start periodic monitoring checks
 */
const startPeriodicChecks = () => {
  // Memory monitoring
  setInterval(() => checkMemoryUsage(), alertConfig.memory.checkInterval);
  
  // Connection monitoring
  setInterval(() => checkConnectionCount(), alertConfig.connections.checkInterval);
  
  // Task monitoring
  setInterval(() => checkTaskCount(), alertConfig.tasks.checkInterval);
  
  // Response time monitoring
  setInterval(() => checkResponseTime(), alertConfig.responseTime.checkInterval);
  
  // Error rate monitoring
  setInterval(() => checkErrorRate(), alertConfig.errorRate.checkInterval);
  
  // Database monitoring
  setInterval(() => checkDatabaseLatency(), alertConfig.database.checkInterval);
  
  // Provider monitoring
  setInterval(() => checkProviderHealth(), alertConfig.database.checkInterval);
};

/**
 * Check memory usage
 */
const checkMemoryUsage = () => {
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  
  if (heapUsedMB > alertConfig.memory.critical) {
    createAlert(
      AlertType.MEMORY,
      AlertLevel.CRITICAL,
      `Critical memory usage: ${heapUsedMB}MB`,
      { value: heapUsedMB, threshold: alertConfig.memory.critical }
    );
  } else if (heapUsedMB > alertConfig.memory.warning) {
    createAlert(
      AlertType.MEMORY,
      AlertLevel.WARNING,
      `High memory usage: ${heapUsedMB}MB`,
      { value: heapUsedMB, threshold: alertConfig.memory.warning }
    );
  }
};

/**
 * Check connection count
 */
const checkConnectionCount = () => {
  const connectionCount = totalActiveConnections;
  
  if (connectionCount > alertConfig.connections.critical) {
    createAlert(
      AlertType.CONNECTIONS,
      AlertLevel.CRITICAL,
      `Critical connection count: ${connectionCount}`,
      { value: connectionCount, threshold: alertConfig.connections.critical }
    );
  } else if (connectionCount > alertConfig.connections.warning) {
    createAlert(
      AlertType.CONNECTIONS,
      AlertLevel.WARNING,
      `High connection count: ${connectionCount}`,
      { value: connectionCount, threshold: alertConfig.connections.warning }
    );
  }
};

/**
 * Check task count
 */
const checkTaskCount = () => {
  const taskCount = getActiveTasks().length;
  
  if (taskCount > alertConfig.tasks.critical) {
    createAlert(
      AlertType.TASKS,
      AlertLevel.CRITICAL,
      `Critical task count: ${taskCount}`,
      { value: taskCount, threshold: alertConfig.tasks.critical }
    );
  } else if (taskCount > alertConfig.tasks.warning) {
    createAlert(
      AlertType.TASKS,
      AlertLevel.WARNING,
      `High task count: ${taskCount}`,
      { value: taskCount, threshold: alertConfig.tasks.warning }
    );
  }
};

/**
 * Check response time (mock implementation)
 */
const checkResponseTime = () => {
  // Mock response time - in real implementation, this would track actual API response times
  const responseTime = Math.floor(Math.random() * 2000); // Random between 0-2000ms
  
  if (responseTime > alertConfig.responseTime.critical) {
    createAlert(
      AlertType.RESPONSE_TIME,
      AlertLevel.CRITICAL,
      `Critical response time: ${responseTime}ms`,
      { value: responseTime, threshold: alertConfig.responseTime.critical }
    );
  } else if (responseTime > alertConfig.responseTime.warning) {
    createAlert(
      AlertType.RESPONSE_TIME,
      AlertLevel.WARNING,
      `High response time: ${responseTime}ms`,
      { value: responseTime, threshold: alertConfig.responseTime.warning }
    );
  }
};

/**
 * Check error rate (mock implementation)
 */
const checkErrorRate = () => {
  // Mock error rate - in real implementation, this would track actual error rates
  const errorRate = Math.floor(Math.random() * 20); // Random between 0-20 errors per minute
  
  if (errorRate > alertConfig.errorRate.critical) {
    createAlert(
      AlertType.ERROR_RATE,
      AlertLevel.CRITICAL,
      `Critical error rate: ${errorRate} errors/min`,
      { value: errorRate, threshold: alertConfig.errorRate.critical }
    );
  } else if (errorRate > alertConfig.errorRate.warning) {
    createAlert(
      AlertType.ERROR_RATE,
      AlertLevel.WARNING,
      `High error rate: ${errorRate} errors/min`,
      { value: errorRate, threshold: alertConfig.errorRate.warning }
    );
  }
};

/**
 * Check database latency
 */
const checkDatabaseLatency = async () => {
  // Mock database latency check - in real implementation, this would access the actual database
  // For now, simulate database latency with random values
  const latency = Math.floor(Math.random() * 200); // Random between 0-200ms
  
  if (latency > alertConfig.database.critical) {
    createAlert(
      AlertType.DATABASE,
      AlertLevel.CRITICAL,
      `Critical database latency: ${latency}ms`,
      { value: latency, threshold: alertConfig.database.critical }
    );
  } else if (latency > alertConfig.database.warning) {
    createAlert(
      AlertType.DATABASE,
      AlertLevel.WARNING,
      `High database latency: ${latency}ms`,
      { value: latency, threshold: alertConfig.database.warning }
    );
  }
};

/**
 * Check provider health
 */
const checkProviderHealth = () => {
  // Mock provider health check - in real implementation, this would check actual provider connectivity
  const providers = ['ollama', 'openai'];
  
  for (const provider of providers) {
    const isHealthy = Math.random() > 0.1; // 90% chance of being healthy
    
    if (!isHealthy) {
      createAlert(
        AlertType.PROVIDER,
        AlertLevel.CRITICAL,
        `Provider ${provider} is unhealthy`,
        { provider }
      );
    }
  }
};

/**
 * Create a new alert
 */
const createAlert = (type, level, message, data = {}) => {
  const alert = {
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    level,
    message,
    data,
    timestamp: Date.now(),
    acknowledged: false,
    resolved: false
  };
  
  // Add to active alerts
  activeAlerts.set(alert.id, alert);
  
  // Add to history
  alertHistory.push(alert);
  if (alertHistory.length > maxAlertHistory) {
    alertHistory.shift(); // Remove oldest alert
  }
  
  // Update statistics
  alertStats.total++;
  alertStats.byLevel[level]++;
  if (!alertStats.byType[type]) {
    alertStats.byType[type] = 0;
  }
  alertStats.byType[type]++;
  
  // Log alert
  logAlert(alert);
  
  // Send notification (for now, just log - could be extended to send emails, Slack, etc.)
  sendAlertNotification(alert);
};

/**
 * Log alert to console
 */
const logAlert = (alert) => {
  const timestamp = new Date(alert.timestamp).toISOString();
  const levelIcon = alert.level === 'critical' ? '🚨' : alert.level === 'warning' ? '⚠️' : 'ℹ️';
  
  console.log(`[${timestamp}] ${levelIcon} ${alert.level.toUpperCase()}: ${alert.message}`);
  if (Object.keys(alert.data).length > 0) {
    console.log(`  Data: ${JSON.stringify(alert.data, null, 2)}`);
  }
};

/**
 * Send alert notification (placeholder implementation)
 */
const sendAlertNotification = (alert) => {
  // In a real implementation, this could send notifications to:
  // - Email
  // - Slack/Teams
  // - SMS
  // - PagerDuty
  // - Webhook
  
  // For now, just log that a notification would be sent
  console.log(`📧 Notification would be sent for alert: ${alert.id}`);
};

/**
 * Cleanup old alerts
 */
const cleanupOldAlerts = () => {
  const now = Date.now();
  const alertsToKeep = [];
  
  for (const alert of activeAlerts.values()) {
    // Keep alerts for 24 hours
    if (now - alert.timestamp < 24 * 60 * 60 * 1000) {
      alertsToKeep.push(alert);
    }
  }
  
  // Update active alerts
  activeAlerts.clear();
  for (const alert of alertsToKeep) {
    activeAlerts.set(alert.id, alert);
  }
  
  console.log(`Alert cleanup: ${activeAlerts.size} active alerts remain`);
};

/**
 * Get active alerts
 */
export const getActiveAlerts = () => {
  return Array.from(activeAlerts.values());
};

/**
 * Get alert history
 */
export const getAlertHistory = (limit = 100) => {
  return alertHistory.slice(-limit);
};

/**
 * Get alert statistics
 */
export const getAlertStats = () => {
  return { ...alertStats };
};

/**
 * Acknowledge an alert
 */
export const acknowledgeAlert = (alertId) => {
  const alert = activeAlerts.get(alertId);
  if (alert) {
    alert.acknowledged = true;
    console.log(`✅ Alert acknowledged: ${alertId}`);
    return true;
  }
  return false;
};

/**
 * Resolve an alert
 */
export const resolveAlert = (alertId) => {
  const alert = activeAlerts.get(alertId);
  if (alert) {
    alert.resolved = true;
    alert.resolvedAt = Date.now();
    activeAlerts.delete(alertId);
    console.log(`✅ Alert resolved: ${alertId}`);
    return true;
  }
  return false;
};

/**
 * Get system health score (0-100)
 */
export const getHealthScore = () => {
  const alerts = getActiveAlerts();
  const criticalAlerts = alerts.filter(a => a.level === 'critical' && !a.resolved).length;
  const warningAlerts = alerts.filter(a => a.level === 'warning' && !a.resolved).length;
  
  // Start with 100 points
  let score = 100;
  
  // Deduct points for critical alerts (10 points each)
  score -= criticalAlerts * 10;
  
  // Deduct points for warning alerts (5 points each)
  score -= warningAlerts * 5;
  
  // Ensure score is between 0 and 100
  return Math.max(0, Math.min(100, score));
};

/**
 * Initialize the alerting system when this module is imported
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeAlertingSystem();
}

export default {
  initializeAlertingSystem,
  getActiveAlerts,
  getAlertHistory,
  getAlertStats,
  acknowledgeAlert,
  resolveAlert,
  getHealthScore,
  alertConfig
};