/**
 * Task Management Routes - Create, monitor, and manage background tasks
 */

import { applyRateLimit } from "../middleware/security.js";
import { getGlobalTaskManager } from "../monitoring/taskManager.js";
import { getGlobalHealthMonitor } from "../monitoring/healthMonitor.js";
import { readRequestBody, sendJson, sendError } from "../utils/responses.js";

/**
 * Handle task creation endpoint
 */
export const handleCreateTask = async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/api/tasks') {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    const body = await readRequestBody(request);
    const { type, priority, data, maxAttempts, timeout, dependencies } = body;
    
    // Validate required fields
    if (!type || typeof type !== 'string') {
      sendError(response, 400, 'Task type is required and must be a string');
      return true;
    }
    
    // Validate task type
    const validTaskTypes = ['chat', 'health_check', 'cleanup', 'analysis'];
    if (!validTaskTypes.includes(type)) {
      sendError(response, 400, `Invalid task type. Must be one of: ${validTaskTypes.join(', ')}`);
      return true;
    }
    
    // Get task manager
    const taskManager = getGlobalTaskManager();
    if (!taskManager) {
      sendError(response, 503, 'Task manager not available');
      return true;
    }
    
    // Create task
    const taskData = {
      type,
      priority: priority || 'normal',
      data: data || {},
      maxAttempts: maxAttempts || 3,
      timeout: timeout || 300000, // 5 minutes default
      dependencies: dependencies || []
    };
    
    const taskId = taskManager.createTask(taskData);
    
    // Get created task for response
    const task = taskManager.getTask(taskId);
    
    sendJson(response, 201, {
      success: true,
      message: 'Task created successfully',
      task: {
        id: taskId,
        type: task.type,
        status: task.status,
        priority: task.priority,
        createdAt: task.createdAt,
        data: task.data
      }
    });
    
    return true;
    
  } catch (error) {
    console.error('Task creation error:', error);
    sendError(response, 500, error.message || 'Failed to create task');
    return true;
  }
};

/**
 * Handle task retrieval endpoint
 */
export const handleGetTask = async (request, response, taskId) => {
  if (request.method !== 'GET' || request.url !== `/api/tasks/${taskId}`) {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    const taskManager = getGlobalTaskManager();
    if (!taskManager) {
      sendError(response, 503, 'Task manager not available');
      return true;
    }
    
    const task = taskManager.getTask(taskId);
    if (!task) {
      sendError(response, 404, 'Task not found');
      return true;
    }
    
    sendJson(response, 200, {
      success: true,
      task
    });
    
    return true;
    
  } catch (error) {
    console.error('Task retrieval error:', error);
    sendError(response, 500, error.message || 'Failed to retrieve task');
    return true;
  }
};

/**
 * Handle task cancellation endpoint
 */
export const handleCancelTask = async (request, response, taskId) => {
  if (request.method !== 'DELETE' || request.url !== `/api/tasks/${taskId}`) {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    const taskManager = getGlobalTaskManager();
    if (!taskManager) {
      sendError(response, 503, 'Task manager not available');
      return true;
    }
    
    const task = taskManager.getTask(taskId);
    if (!task) {
      sendError(response, 404, 'Task not found');
      return true;
    }
    
    // Check if task can be cancelled
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      sendError(response, 400, 'Cannot cancel a completed task');
      return true;
    }
    
    // Cancel task
    taskManager.cancelTask(taskId, 'Cancelled via API');
    
    sendJson(response, 200, {
      success: true,
      message: 'Task cancelled successfully',
      task: {
        id: taskId,
        status: task.status
      }
    });
    
    return true;
    
  } catch (error) {
    console.error('Task cancellation error:', error);
    sendError(response, 500, error.message || 'Failed to cancel task');
    return true;
  }
};

/**
 * Handle task listing endpoint
 */
export const handleListTasks = async (request, response) => {
  if (request.method !== 'GET' || request.url !== '/api/tasks') {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    const url = new URL(request.url, `http://${request.headers.host}`);
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const offset = parseInt(url.searchParams.get('offset')) || 0;
    
    const taskManager = getGlobalTaskManager();
    if (!taskManager) {
      sendError(response, 503, 'Task manager not available');
      return true;
    }
    
    // Build filter object
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    
    // Get tasks
    let tasks = taskManager.getTasks(filter);
    
    // Apply pagination
    const paginatedTasks = tasks.slice(offset, offset + limit);
    
    // Get statistics
    const stats = taskManager.getTaskStats();
    
    sendJson(response, 200, {
      success: true,
      tasks: paginatedTasks,
      pagination: {
        total: tasks.length,
        limit,
        offset,
        hasMore: offset + limit < tasks.length
      },
      stats
    });
    
    return true;
    
  } catch (error) {
    console.error('Task listing error:', error);
    sendError(response, 500, error.message || 'Failed to list tasks');
    return true;
  }
};

/**
 * Handle task statistics endpoint
 */
export const handleTaskStats = async (request, response) => {
  if (request.method !== 'GET' || request.url !== '/api/tasks/stats') {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    const taskManager = getGlobalTaskManager();
    if (!taskManager) {
      sendError(response, 503, 'Task manager not available');
      return true;
    }
    
    const stats = taskManager.getTaskStats();
    const activeTasks = taskManager.getActiveTasks();
    
    sendJson(response, 200, {
      success: true,
      stats,
      activeTasks: activeTasks.slice(0, 20), // Limit to 20 active tasks
      timestamp: Date.now()
    });
    
    return true;
    
  } catch (error) {
    console.error('Task statistics error:', error);
    sendError(response, 500, error.message || 'Failed to get task statistics');
    return true;
  }
};

/**
 * Register task management routes
 */
export function registerTaskRoutes(server, registry, providers, failoverChains, settings) {
  // Task creation endpoint
  server.on('request', async (request, response) => {
    if (await handleCreateTask(request, response)) {
      return;
    }
    
    if (await handleListTasks(request, response)) {
      return;
    }
    
    if (await handleTaskStats(request, response)) {
      return;
    }
    
    // Handle task-specific routes with URL patterns
    const urlMatch = request.url?.match(/^\/api\/tasks\/([a-zA-Z0-9_-]+)$/);
    if (urlMatch) {
      const taskId = urlMatch[1];
      
      if (request.method === 'GET') {
        await handleGetTask(request, response, taskId);
        return;
      }
      
      if (request.method === 'DELETE') {
        await handleCancelTask(request, response, taskId);
        return;
      }
    }
    
    // If no task handler matched, continue to other routes
    return false;
  });
}