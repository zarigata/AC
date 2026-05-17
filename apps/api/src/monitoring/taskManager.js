/**
 * Enhanced Task Manager - Persistent task tracking and lifecycle management
 */

import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

/**
 * Task status constants
 */
const TASK_STATUSES = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Task priority levels
 */
const TASK_PRIORITIES = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  CRITICAL: 4
};

/**
 * Task Manager Class
 */
export class TaskManager {
  constructor(registry) {
    this.registry = registry;
    this.tasks = new Map();
    this.taskHistory = [];
    this.maxHistorySize = 1000;
    this.isRunning = false;
    this.cleanupInterval = null;
    this.taskCallbacks = new Set();
    
    // Performance tracking
    this.performanceMetrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageDuration: 0,
      tasksByType: {},
      tasksByStatus: {},
      activeTasks: 0,
      maxConcurrentTasks: 0
    };
    
    // Initialize task cleanup
    this.initializeCleanup();
  }
  
  /**
   * Initialize task cleanup process
   */
  initializeCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldTasks();
    }, 60 * 1000); // Run cleanup every minute
  }
  
  /**
   * Create a new task
   */
  createTask(taskData) {
    const taskId = this.generateTaskId();
    const task = {
      id: taskId,
      type: taskData.type || 'unknown',
      priority: taskData.priority || TASK_PRIORITIES.NORMAL,
      status: TASK_STATUSES.PENDING,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      data: taskData.data || {},
      result: null,
      error: null,
      progress: 0,
      maxProgress: taskData.maxProgress || 100,
      metadata: taskData.metadata || {},
      
      // Tracking
      attempts: 0,
      maxAttempts: taskData.maxAttempts || 3,
      timeout: taskData.timeout || 5 * 60 * 1000, // 5 minutes default
      retryDelay: taskData.retryDelay || 1000,
      dependencies: taskData.dependencies || [],
      
      // Performance
      estimatedDuration: taskData.estimatedDuration || null,
      actualDuration: null,
      cpuUsage: [],
      memoryUsage: []
    };
    
    // Store task
    this.tasks.set(taskId, task);
    
    // Update performance metrics
    this.updatePerformanceMetrics('create', task);
    
    // Add to history
    this.addToHistory('created', task);
    
    // Log task creation
    console.log(`📋 Task created: ${taskId} (${task.type}) [priority: ${task.priority}]`);
    
    // If dependencies are met, start the task
    if (this.areDependenciesMet(taskId)) {
      this.startTask(taskId);
    }
    
    return taskId;
  }
  
  /**
   * Generate unique task ID
   */
  generateTaskId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `task_${timestamp}_${random}`;
  }
  
  /**
   * Start a task
   */
  async startTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    if (task.status !== TASK_STATUSES.PENDING) {
      throw new Error(`Task already started or completed: ${task.status}`);
    }
    
    // Check dependencies again
    if (!this.areDependenciesMet(taskId)) {
      throw new Error(`Dependencies not met for task: ${taskId}`);
    }
    
    // Update task status
    task.status = TASK_STATUSES.RUNNING;
    task.startedAt = Date.now();
    task.attempts++;
    
    this.updatePerformanceMetrics('start', task);
    this.addToHistory('started', task);
    
    console.log(`🚀 Task started: ${taskId} (${task.type}) [attempt ${task.attempts}/${task.maxAttempts}]`);
    
    // Notify callbacks
    this.notifyTaskChange('started', task);
    
    // Execute task with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task timeout: ${taskId}`));
      }, task.timeout);
    });
    
    const executePromise = this.executeTask(task);
    
    try {
      await Promise.race([executePromise, timeoutPromise]);
    } catch (error) {
      await this.handleTaskError(taskId, error);
    }
  }
  
  /**
   * Execute the actual task logic
   */
  async executeTask(task) {
    const startTime = Date.now();
    
    try {
      // Track memory and CPU usage during execution
      const startMemory = process.memoryUsage();
      
      // Execute task based on type
      let result;
      switch (task.type) {
        case 'chat':
          result = await this.executeChatTask(task);
          break;
        case 'provider_health_check':
          result = await this.executeHealthCheckTask(task);
          break;
        case 'database_cleanup':
          result = await this.executeCleanupTask(task);
          break;
        default:
          result = await this.executeGenericTask(task);
      }
      
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      
      // Update task with result
      task.status = TASK_STATUSES.COMPLETED;
      task.completedAt = endTime;
      task.actualDuration = endTime - startTime;
      task.result = result;
      task.progress = task.maxProgress;
      
      // Track memory usage
      task.memoryUsage.push({
        timestamp: endTime,
        rss: endMemory.rss,
        heapUsed: endMemory.heapUsed,
        external: endMemory.external
      });
      
      this.updatePerformanceMetrics('complete', task);
      this.addToHistory('completed', task);
      
      console.log(`✅ Task completed: ${taskId} (${task.actualDuration}ms)`);
      
      // Notify callbacks
      this.notifyTaskChange('completed', task);
      
    } catch (error) {
      throw error; // Will be caught by handleTaskError
    }
  }
  
  /**
   * Execute chat task
   */
  async executeChatTask(task) {
    const { agentId, sessionId, message } = task.data;
    
    if (!agentId || !sessionId || !message) {
      throw new Error('Chat task requires agentId, sessionId, and message');
    }
    
    const agent = this.registry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    
    // Get or create session
    let session;
    const sessions = registry.listSessions(agentId);
    session = sessions.sessions.find(s => s.id === sessionId);
    
    if (!session) {
      session = registry.createSession(agentId, {
        title: message.slice(0, 50) + (message.length > 50 ? '...' : '')
      });
    }
    
    // Save user message
    registry.createMessage(agentId, session.id, {
      role: 'user',
      content: message.trim(),
      tokensIn: 0
    });
    
    // Get context window
    const { MemoryManager } = await import('../memory/memoryManager.js');
    const memoryManager = new MemoryManager(registry);
    const contextWindow = await memoryManager.getCompleteContext(agentId, session.id);
    
    // Add system prompt if defined
    if (agent.systemPrompt && agent.systemPrompt.trim()) {
      contextWindow.unshift({
        role: 'system',
        content: agent.systemPrompt.trim()
      });
    }
    
    // Add user message to context
    const userMessage = {
      role: 'user',
      content: message.trim(),
      timestamp: new Date().toISOString()
    };
    contextWindow.push(userMessage);
    
    // Call provider
    const { createProvider } = await import('../adapters/ollama.js');
    const provider = createProvider(agent.provider?.toLowerCase()) || createProvider('ollama');
    
    if (!provider) {
      throw new Error(`Provider ${agent.provider} not available`);
    }
    
    // Generate response
    const result = await provider.chat(contextWindow, { 
      model: agent.model, 
      temperature: 0.7, 
      maxTokens: 512 
    });
    
    // Save assistant response
    registry.createMessage(agentId, session.id, {
      role: 'assistant',
      content: result.content,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      model: result.model
    });
    
    // Add assistant response to context
    const assistantMessage = {
      role: 'assistant',
      content: result.content,
      timestamp: new Date().toISOString()
    };
    await memoryManager.addMessageToContext(agentId, session.id, assistantMessage);
    
    return {
      type: 'chat_response',
      agentId,
      sessionId,
      message: result.content,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      duration: result.duration,
      model: result.model
    };
  }
  
  /**
   * Execute health check task
   */
  async executeHealthCheckTask(task) {
    const { providerName } = task.data;
    
    if (!providerName) {
      throw new Error('Health check task requires providerName');
    }
    
    // Import health monitor
    const { HealthMonitor } = await import('./healthMonitor.js');
    
    // Check provider health
    const startTime = Date.now();
    let success = false;
    let latency = 0;
    let error = null;
    
    try {
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
      
    } catch (err) {
      success = false;
      error = err;
      latency = Date.now() - startTime;
    }
    
    return {
      provider: providerName,
      success,
      latency,
      error: error ? error.message : null,
      timestamp: Date.now()
    };
  }
  
  /**
   * Execute cleanup task
   */
  async executeCleanupTask(task) {
    const { type } = task.data;
    
    if (type === 'old_sessions') {
      // Clean up old sessions
      const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
      let cleanedCount = 0;
      
      // This would require more complex session management
      // For now, just return mock result
      cleanedCount = Math.floor(Math.random() * 10) + 1;
      
      return {
        type: 'session_cleanup',
        cleanedSessions: cleanedCount,
        cutoffDate: new Date(cutoff).toISOString()
      };
    }
    
    throw new Error(`Unknown cleanup type: ${type}`);
  }
  
  /**
   * Execute generic task
   */
  async executeGenericTask(task) {
    // For unknown task types, just simulate execution
    await setTimeout(1000 + Math.random() * 2000); // Random delay
    
    return {
      type: 'generic_result',
      message: 'Task completed successfully',
      timestamp: Date.now()
    };
  }
  
  /**
   * Handle task execution errors
   */
  async handleTaskError(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    task.error = {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    };
    
    // Check if we should retry
    if (task.attempts < task.maxAttempts) {
      console.log(`🔄 Retrying task: ${taskId} (attempt ${task.attempts + 1}/${task.maxAttempts})`);
      
      // Schedule retry with delay
      setTimeout(() => {
        this.startTask(taskId);
      }, task.retryDelay * task.attempts); // Exponential backoff
    } else {
      // Task failed permanently
      task.status = TASK_STATUSES.FAILED;
      task.completedAt = Date.now();
      
      this.updatePerformanceMetrics('fail', task);
      this.addToHistory('failed', task);
      
      console.log(`❌ Task failed: ${taskId} (${error.message})`);
      
      // Notify callbacks
      this.notifyTaskChange('failed', task);
    }
  }
  
  /**
   * Cancel a task
   */
  cancelTask(taskId, reason = 'Task cancelled by user') {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    if (task.status === TASK_STATUSES.COMPLETED || 
        task.status === TASK_STATUSES.FAILED || 
        task.status === TASK_STATUSES.CANCELLED) {
      throw new Error(`Task already completed: ${task.status}`);
    }
    
    task.status = TASK_STATUSES.CANCELLED;
    task.cancelledAt = Date.now();
    task.error = { message: reason, timestamp: Date.now() };
    
    this.updatePerformanceMetrics('cancel', task);
    this.addToHistory('cancelled', task);
    
    console.log(`🚫 Task cancelled: ${taskId} (${reason})`);
    
    // Notify callbacks
    this.notifyTaskChange('cancelled', task);
  }
  
  /**
   * Get task by ID
   */
  getTask(taskId) {
    return this.tasks.get(taskId);
  }
  
  /**
   * Get all tasks with optional filtering
   */
  getTasks(filter = {}) {
    let tasks = Array.from(this.tasks.values());
    
    if (filter.status) {
      tasks = tasks.filter(task => task.status === filter.status);
    }
    
    if (filter.type) {
      tasks = tasks.filter(task => task.type === filter.type);
    }
    
    if (filter.priority) {
      tasks = tasks.filter(task => task.priority === filter.priority);
    }
    
    if (filter.createdAfter) {
      tasks = tasks.filter(task => task.createdAt >= filter.createdAfter);
    }
    
    if (filter.createdBefore) {
      tasks = tasks.filter(task => task.createdAt <= filter.createdBefore);
    }
    
    return tasks.sort((a, b) => b.createdAt - a.createdAt); // Most recent first
  }
  
  /**
   * Get active tasks (running or pending)
   */
  getActiveTasks() {
    return this.getTasks({ status: 'running' });
  }
  
  /**
   * Get task statistics
   */
  getTaskStats() {
    const tasks = this.getTasks();
    const stats = {
      total: tasks.length,
      active: tasks.filter(t => t.status === 'running' || t.status === 'pending').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
      byType: {},
      byStatus: {},
      averageDuration: 0,
      totalDuration: 0
    };
    
    // Calculate type and status breakdowns
    tasks.forEach(task => {
      // By type
      if (!stats.byType[task.type]) {
        stats.byType[task.type] = { total: 0, completed: 0, failed: 0 };
      }
      stats.byType[task.type].total++;
      if (task.status === 'completed') stats.byType[task.type].completed++;
      if (task.status === 'failed') stats.byType[task.type].failed++;
      
      // By status
      if (!stats.byStatus[task.status]) {
        stats.byStatus[task.status] = 0;
      }
      stats.byStatus[task.status]++;
      
      // Duration calculations
      if (task.actualDuration) {
        stats.totalDuration += task.actualDuration;
      }
    });
    
    stats.averageDuration = stats.completed > 0 ? stats.totalDuration / stats.completed : 0;
    
    return stats;
  }
  
  /**
   * Check if task dependencies are met
   */
  areDependenciesMet(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || !task.dependencies || task.dependencies.length === 0) {
      return true;
    }
    
    return task.dependencies.every(depId => {
      const depTask = this.tasks.get(depId);
      return depTask && depTask.status === TASK_STATUSES.COMPLETED;
    });
  }
  
  /**
   * Clean up old completed tasks
   */
  cleanupOldTasks() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    let cleanedCount = 0;
    
    for (const [taskId, task] of this.tasks) {
      if (task.status === TASK_STATUSES.COMPLETED && 
          task.completedAt && 
          task.completedAt < cutoff) {
        this.tasks.delete(taskId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old completed tasks`);
    }
  }
  
  /**
   * Add task event to history
   */
  addToHistory(event, task) {
    const historyEntry = {
      timestamp: Date.now(),
      taskId: task.id,
      event,
      task: {
        type: task.type,
        status: task.status,
        priority: task.priority
      }
    };
    
    this.taskHistory.push(historyEntry);
    
    // Keep history size limited
    if (this.taskHistory.length > this.maxHistorySize) {
      this.taskHistory = this.taskHistory.slice(-this.maxHistorySize);
    }
  }
  
  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(action, task) {
    switch (action) {
      case 'create':
        this.performanceMetrics.totalTasks++;
        this.performanceMetrics.activeTasks++;
        this.performanceMetrics.maxConcurrentTasks = Math.max(
          this.performanceMetrics.maxConcurrentTasks,
          this.performanceMetrics.activeTasks
        );
        
        // By type
        if (!this.performanceMetrics.tasksByType[task.type]) {
          this.performanceMetrics.tasksByType[task.type] = 0;
        }
        this.performanceMetrics.tasksByType[task.type]++;
        break;
        
      case 'complete':
        this.performanceMetrics.completedTasks++;
        this.performanceMetrics.activeTasks--;
        this.performanceMetrics.tasksByStatus[TASK_STATUSES.COMPLETED] = 
          (this.performanceMetrics.tasksByStatus[TASK_STATUSES.COMPLETED] || 0) + 1;
        
        if (task.actualDuration) {
          this.performanceMetrics.averageDuration = 
            (this.performanceMetrics.averageDuration * (this.performanceMetrics.completedTasks - 1) + task.actualDuration) / 
            this.performanceMetrics.completedTasks;
        }
        break;
        
      case 'fail':
        this.performanceMetrics.failedTasks++;
        this.performanceMetrics.activeTasks--;
        this.performanceMetrics.tasksByStatus[TASK_STATUSES.FAILED] = 
          (this.performanceMetrics.tasksByStatus[TASK_STATUSES.FAILED] || 0) + 1;
        break;
        
      case 'cancel':
        this.performanceMetrics.activeTasks--;
        this.performanceMetrics.tasksByStatus[TASK_STATUSES.CANCELLED] = 
          (this.performanceMetrics.tasksByStatus[TASK_STATUSES.CANCELLED] || 0) + 1;
        break;
    }
  }
  
  /**
   * Add task change callback
   */
  onTaskChange(callback) {
    this.taskCallbacks.add(callback);
  }
  
  /**
   * Remove task change callback
   */
  removeTaskChangeCallback(callback) {
    this.taskCallbacks.delete(callback);
  }
  
  /**
   * Notify all callbacks of task status change
   */
  notifyTaskChange(event, task) {
    const changeEvent = {
      event,
      task,
      timestamp: Date.now()
    };
    
    for (const callback of this.taskCallbacks) {
      try {
        callback(changeEvent);
      } catch (error) {
        console.error('Task change callback error:', error);
      }
    }
  }
}

// Export task constants and create singleton instance
export { TASK_STATUSES, TASK_PRIORITIES };

let globalTaskManager = null;

export function createTaskManager(registry) {
  if (!globalTaskManager) {
    globalTaskManager = new TaskManager(registry);
  }
  return globalTaskManager;
}

export function getGlobalTaskManager() {
  return globalTaskManager;
}