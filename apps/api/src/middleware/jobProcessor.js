/**
 * Job Processor - Handles background task execution and job management
 */

import { sanitizeOutput } from './security.js';

// Simple Job Processor Configuration
const JOB_PROCESSOR_INTERVAL = 5000; // 5 seconds
const MAX_CONCURRENT_JOBS = 3;
const runningJobs = new Set();

// Broadcast function (will be injected from WebSocket handler)
let broadcastJobUpdate;

/**
 * Simple job processor for background tasks
 */
export const processJobs = async (registry, broadcastFunction) => {
  // Set broadcast function
  broadcastJobUpdate = broadcastFunction;
  
  try {
    // Don't process too many jobs concurrently
    if (runningJobs.size >= MAX_CONCURRENT_JOBS) {
      return;
    }
    
    // Get next pending job
    const pendingJobs = registry.getPendingJobs(1);
    if (pendingJobs.length === 0) {
      return;
    }
    
    const job = pendingJobs[0];
    const jobId = job.id;
    
    // Validate job structure before processing
    if (!job || typeof job !== 'object' || !job.id || !job.type) {
      console.error('Invalid job structure:', job);
      return;
    }
    
    // Mark job as running
    runningJobs.add(jobId);
    try {
      const runningJob = registry.updateJob(jobId, { status: 'running' });
      if (!runningJob) {
        runningJobs.delete(jobId);
        console.error(`Failed to update job status for job ${jobId}`);
        return;
      }
    } catch (updateError) {
      runningJobs.delete(jobId);
      console.error(`Failed to update job status for job ${jobId}:`, updateError.message);
      return;
    }
    
    // Broadcast job start
    try {
      broadcastJobUpdate({
        id: jobId,
        name: sanitizeOutput(job.name),
        type: sanitizeOutput(job.type),
        status: 'running',
        progress: 0,
        startedAt: runningJob.startedAt
      });
    } catch (broadcastError) {
      console.error('Failed to broadcast job start:', broadcastError.message);
    }
    
    console.log(`Starting job: ${job.name} (${jobId})`);
    
    // Process the job based on its type with enhanced error handling
    try {
      let result;
      
      switch (job.type) {
        case 'test':
          // Simple test job that just waits a bit
          await new Promise(resolve => setTimeout(resolve, 2000));
          result = { message: 'Test job completed successfully', timestamp: Date.now() };
          break;
          
        case 'cleanup':
          // Cleanup job - could clean old logs, sessions, etc.
          result = { 
            message: 'Cleanup completed', 
            cleanedItems: Math.floor(Math.random() * 100),
            timestamp: Date.now() 
          };
          break;
          
        case 'backup':
          // Simulate backup job with progress updates
          for (let i = 20; i <= 80; i += 20) {
            await new Promise(resolve => setTimeout(resolve, 500));
            registry.updateJob(jobId, { progress: i });
            broadcastJobUpdate({
              id: jobId,
              name: job.name,
              type: job.type,
              status: 'running',
              progress: i
            });
          }
          result = { 
            message: 'Backup completed', 
            backupSize: `${Math.floor(Math.random() * 1000) + 100}MB`,
            timestamp: Date.now() 
          };
          break;
          
        case 'analysis':
          // Simulate analysis job
          for (let i = 10; i <= 90; i += 10) {
            await new Promise(resolve => setTimeout(resolve, 300));
            registry.updateJob(jobId, { progress: i });
            broadcastJobUpdate({
              id: jobId,
              name: job.name,
              type: job.type,
              status: 'running',
              progress: i
            });
          }
          result = { 
            message: 'Analysis completed', 
            itemsProcessed: Math.floor(Math.random() * 500) + 100,
            timestamp: Date.now() 
          };
          break;
          
        case 'validation':
          // Simulate validation job
          await new Promise(resolve => setTimeout(resolve, 1000));
          result = { 
            message: 'Validation completed', 
            validatedItems: Math.floor(Math.random() * 200) + 50,
            errorsFound: Math.floor(Math.random() * 5),
            timestamp: Date.now() 
          };
          break;
          
        default:
          // Generic job processing
          await new Promise(resolve => setTimeout(resolve, 1000));
          result = { 
            message: `Job type ${sanitizeOutput(job.type)} processed`, 
            timestamp: Date.now() 
          };
      }
      
      // Update job with result with error handling
      try {
        const completedJob = registry.updateJob(jobId, { 
          status: 'completed', 
          progress: 100,
          result: sanitizeOutput(result) 
        });
        
        // Broadcast job completion with error handling
        broadcastJobUpdate({
          id: jobId,
          name: sanitizeOutput(job.name),
          type: sanitizeOutput(job.type),
          status: 'completed',
          progress: 100,
          result: sanitizeOutput(result),
          completedAt: completedJob.completedAt
        });
        
        console.log(`Completed job: ${job.name} (${jobId})`);
      } catch (completionError) {
        console.error(`Failed to complete job ${jobId}:`, completionError.message);
      }
      
    } catch (error) {
      // Mark job as failed
      const failedJob = registry.updateJob(jobId, { 
        status: 'failed', 
        error: error.message 
      });
      
      // Broadcast job failure
      broadcastJobUpdate({
        id: jobId,
        name: job.name,
        type: job.type,
        status: 'failed',
        progress: failedJob.progress,
        error: error.message
      });
      
      console.error(`Failed job: ${job.name} (${jobId}) - ${error.message}`);
    } finally {
      // Remove from running jobs
      runningJobs.delete(jobId);
    }
    
  } catch (err) {
    console.error('Error in job processor:', err);
  }
};

// Start job processor with dependency injection
export const startJobProcessor = (registry, broadcastFunction, interval = JOB_PROCESSOR_INTERVAL) => {
  const processor = () => processJobs(registry, broadcastFunction);
  
  // Set interval for job processing
  const jobInterval = setInterval(processor, interval);
  console.log(`Job processor started (checking every ${interval}ms, max ${MAX_CONCURRENT_JOBS} concurrent)`);
  
  // Return cleanup function
  return () => {
    if (jobInterval && typeof jobInterval.clear === 'function') {
      clearInterval(jobInterval);
      console.log('Job processor stopped');
    }
  };
};

// Stop job processor
export const stopJobProcessor = (cleanupFunction) => {
  if (cleanupFunction) {
    cleanupFunction();
  }
};

// Get job processor status
export const getJobProcessorStatus = () => {
  return {
    isRunning: runningJobs.size > 0,
    runningJobs: Array.from(runningJobs),
    maxConcurrentJobs: MAX_CONCURRENT_JOBS,
    processorInterval: JOB_PROCESSOR_INTERVAL
  };
};

// Validate job data before processing
export const validateJobData = (job) => {
  if (!job || typeof job !== 'object') {
    throw new Error('Job data must be an object');
  }
  
  if (!job.id || typeof job.id !== 'string') {
    throw new Error('Job must have a valid string ID');
  }
  
  if (!job.name || typeof job.name !== 'string') {
    throw new Error('Job must have a valid string name');
  }
  
  if (!job.type || typeof job.type !== 'string') {
    throw new Error('Job must have a valid string type');
  }
  
  // Validate known job types
  const validJobTypes = ['test', 'cleanup', 'backup', 'analysis', 'validation'];
  if (!validJobTypes.includes(job.type)) {
    console.warn(`Unknown job type: ${job.type}`);
  }
  
  return true;
};

// Create a standard job
export const createJob = (name, type, data = {}) => {
  const job = {
    id: global.crypto?.randomUUID?.() || require('node:crypto').randomUUID(),
    name: name,
    type: type,
    status: 'pending',
    progress: 0,
    data: data,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  };
  
  validateJobData(job);
  return job;
};

// Job priority constants
export const JOB_PRIORITIES = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  CRITICAL: 3
};

// Job status constants
export const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// Enhanced job processor with priority support
export const processJobWithPriority = async (registry, broadcastFunction, job) => {
  // Check if job can be processed based on priority and current load
  if (runningJobs.size >= MAX_CONCURRENT_JOBS) {
    throw new Error('Maximum concurrent jobs reached');
  }
  
  // Validate job data
  validateJobData(job);
  
  // Mark job as running
  runningJobs.add(job.id);
  
  try {
    // Process job (same as before but with priority awareness)
    await processJobs(registry, broadcastFunction);
  } finally {
    // Remove from running jobs
    runningJobs.delete(job.id);
  }
};