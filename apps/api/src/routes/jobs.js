/**
 * Job Routes - Background job management API endpoints
 */

import { readRequestBody, sendJson, sendError } from "../middleware/requestHandler.js";

/**
 * Register job management routes
 */
export const registerJobRoutes = (server, registry, providers, serverState, settings) => {
  /**
   * Create a new job
   * POST /api/jobs
   */
  server.on('request', async (req, res) => {
    if (req.method === 'POST' && req.url === '/api/jobs') {
      try {
        const jobData = await readRequestBody(req);
        
        if (!jobData || typeof jobData !== 'object') {
          return sendError(res, 400, 'Job data must be an object');
        }
        
        const { name, type, data = {} } = jobData;
        
        // Validate required fields
        if (!name || typeof name !== 'string') {
          return sendError(res, 400, 'Job name is required and must be a string');
        }
        
        if (!type || typeof type !== 'string') {
          return sendError(res, 400, 'Job type is required and must be a string');
        }
        
        // Create the job
        const job = registry.createJob({ name, type, data });
        
        // Return created job
        sendJson(res, 201, job);
      } catch (error) {
        console.error('Error creating job:', error);
        sendError(res, 500, `Failed to create job: ${error.message}`);
      }
    }
  });
  
  /**
   * List all jobs with optional filtering
   * GET /api/jobs
   */
  server.on('request', async (req, res) => {
    if (req.method === 'GET' && req.url === '/api/jobs') {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const status = url.searchParams.get('status');
        const type = url.searchParams.get('type');
        const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')) : 50;
        
        const filters = {};
        if (status) filters.status = status;
        if (type) filters.type = type;
        
        const jobs = registry.getJobs(filters, limit);
        sendJson(res, 200, jobs);
      } catch (error) {
        console.error('Error listing jobs:', error);
        sendError(res, 500, `Failed to list jobs: ${error.message}`);
      }
    }
  });
  
  /**
   * Get job processor status
   * GET /api/jobs/status
   */
  server.on('request', async (req, res) => {
    if (req.method === 'GET' && req.url === '/api/jobs/status') {
      try {
        const status = {
          running: serverState.jobProcessorCleanup !== null,
          maxConcurrentJobs: 3,
          timestamp: Date.now()
        };
        
        sendJson(res, 200, status);
      } catch (error) {
        console.error('Error getting job processor status:', error);
        sendError(res, 500, `Failed to get job processor status: ${error.message}`);
      }
    }
  });
  
  /**
   * Get a specific job by ID
   * GET /api/jobs/:id
   */
  server.on('request', async (req, res) => {
    if (req.method === 'GET' && req.url.startsWith('/api/jobs/')) {
      try {
        const jobId = req.url.split('/').pop();
        
        if (!jobId || jobId === 'status') {
          return sendError(res, 400, 'Job ID is required');
        }
        
        const job = registry.getJob(jobId);
        
        if (!job) {
          return sendError(res, 404, `Job with ID ${jobId} not found`);
        }
        
        sendJson(res, 200, job);
      } catch (error) {
        console.error('Error getting job:', error);
        sendError(res, 500, `Failed to get job: ${error.message}`);
      }
    }
  });
  
  /**
   * Update a job by ID
   * PATCH /api/jobs/:id
   */
  server.on('request', async (req, res) => {
    if (req.method === 'PATCH' && req.url.startsWith('/api/jobs/')) {
      try {
        const jobId = req.url.split('/').pop();
        const updates = await readRequestBody(req);
        
        if (!jobId) {
          return sendError(res, 400, 'Job ID is required');
        }
        
        const updatedJob = registry.updateJob(jobId, updates);
        
        if (!updatedJob) {
          return sendError(res, 404, `Job with ID ${jobId} not found`);
        }
        
        sendJson(res, 200, updatedJob);
      } catch (error) {
        console.error('Error updating job:', error);
        sendError(res, 500, `Failed to update job: ${error.message}`);
      }
    }
  });
  
  /**
   * Delete a job by ID
   * DELETE /api/jobs/:id
   */
  server.on('request', async (req, res) => {
    if (req.method === 'DELETE' && req.url.startsWith('/api/jobs/')) {
      try {
        const jobId = req.url.split('/').pop();
        
        if (!jobId) {
          return sendError(res, 400, 'Job ID is required');
        }
        
        const success = registry.deleteJob(jobId);
        
        if (!success) {
          return sendError(res, 404, `Job with ID ${jobId} not found`);
        }
        
        sendJson(res, 204, null);
      } catch (error) {
        console.error('Error deleting job:', error);
        sendError(res, 500, `Failed to delete job: ${error.message}`);
      }
    }
  });
  
  /**
   * Get job processor status
   * GET /api/jobs/status
   */
  server.on('request', async (req, res) => {
    if (req.method === 'GET' && req.url === '/api/jobs/status') {
      try {
        const status = {
          running: serverState.jobProcessorCleanup !== null,
          maxConcurrentJobs: 3,
          timestamp: Date.now()
        };
        
        sendJson(res, 200, status);
      } catch (error) {
        console.error('Error getting job processor status:', error);
        sendError(res, 500, `Failed to get job processor status: ${error.message}`);
      }
    }
  });
  
  /**
   * Cancel a running job
   * PATCH /api/jobs/:id/cancel
   */
  server.on('request', async (req, res) => {
    if (req.method === 'PATCH' && req.url.startsWith('/api/jobs/') && req.url.endsWith('/cancel')) {
      try {
        const jobId = req.url.split('/').filter(segment => segment)[3]; // /api/jobs/:id/cancel
        
        if (!jobId) {
          return sendError(res, 400, 'Job ID is required');
        }
        
        const updatedJob = registry.updateJob(jobId, { 
          status: 'cancelled',
          completedAt: new Date().toISOString()
        });
        
        if (!updatedJob) {
          return sendError(res, 404, `Job with ID ${jobId} not found`);
        }
        
        sendJson(res, 200, updatedJob);
      } catch (error) {
        console.error('Error cancelling job:', error);
        sendError(res, 500, `Failed to cancel job: ${error.message}`);
      }
    }
  });
};