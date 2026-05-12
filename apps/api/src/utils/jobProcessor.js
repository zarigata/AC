/**
 * Job Processor - Handles background job execution
 */

/**
 * Simple Job Processor for background tasks
 */
export class JobProcessor {
  constructor(registry, options = {}) {
    this.registry = registry;
    this.interval = options.interval || 5000; // 5 seconds
    this.maxConcurrent = options.maxConcurrent || 3;
    this.runningJobs = new Set();
    this.intervalId = null;
  }

  /**
   * Start the job processor
   */
  start() {
    if (this.intervalId) return;
    
    this.intervalId = setInterval(() => {
      this.processJobs();
    }, this.interval);
    
    console.log(`Job processor started (checking every ${this.interval}ms, max ${this.maxConcurrent} concurrent)`);
  }

  /**
   * Stop the job processor
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Job processor stopped');
    }
  }

  /**
   * Process pending jobs
   */
  async processJobs() {
    try {
      // Don't process too many jobs concurrently
      if (this.runningJobs.size >= this.maxConcurrent) {
        return;
      }
      
      // Get next pending job
      const pendingJobs = this.registry.getPendingJobs(1);
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
      this.runningJobs.add(jobId);
      try {
        const runningJob = this.registry.updateJob(jobId, { status: 'running' });
        if (!runningJob) {
          this.runningJobs.delete(jobId);
          console.error(`Failed to update job status for job ${jobId}`);
          return;
        }
      } catch (updateError) {
        this.runningJobs.delete(jobId);
        console.error(`Failed to update job status for job ${jobId}:`, updateError.message);
        return;
      }
      
      // Broadcast job start
      try {
        this.broadcastJobUpdate({
          id: jobId,
          name: this.sanitizeOutput(job.name),
          type: this.sanitizeOutput(job.type),
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
              this.registry.updateJob(jobId, { progress: i });
              this.broadcastJobUpdate({
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
            
          default:
            // Generic job processing
            await new Promise(resolve => setTimeout(resolve, 1000));
            result = { 
              message: `Job type ${this.sanitizeOutput(job.type)} processed`, 
              timestamp: Date.now() 
            };
        }
        
        // Update job with result with error handling
        try {
          const completedJob = this.registry.updateJob(jobId, { 
            status: 'completed', 
            progress: 100,
            result: this.sanitizeOutput(result) 
          });
          
          // Broadcast job completion with error handling
          this.broadcastJobUpdate({
            id: jobId,
            name: this.sanitizeOutput(job.name),
            type: this.sanitizeOutput(job.type),
            status: 'completed',
            progress: 100,
            result: this.sanitizeOutput(result),
            completedAt: completedJob.completedAt
          });
          
          console.log(`Completed job: ${job.name} (${jobId})`);
        } catch (completionError) {
          console.error(`Failed to complete job ${jobId}:`, completionError.message);
        }
        
      } catch (error) {
        // Mark job as failed
        const failedJob = this.registry.updateJob(jobId, { 
          status: 'failed', 
          error: error.message 
        });
        
        // Broadcast job failure
        this.broadcastJobUpdate({
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
        this.runningJobs.delete(jobId);
      }
      
    } catch (err) {
      console.error('Error in job processor:', err);
    }
  }

  /**
   * Broadcast job updates to all connected clients
   */
  broadcastJobUpdate(job) {
    const jobUpdate = {
      type: 'job_update',
      timestamp: Date.now(),
      data: job
    };
    
    const message = JSON.stringify(jobUpdate);
    // This would be sent to WebSocket clients
    // For now, just log it
    console.log('Job update:', jobUpdate);
  }

  /**
   * Sanitize output data with enhanced security measures
   */
  sanitizeOutput(data) {
    if (data === null || data === undefined) return data;
    
    if (typeof data === 'string') {
      // Enhanced security: remove potentially dangerous content
      return data
        .replace(/<[^>]*script[^>]*>.*?<\/[^>]*script[^>]*>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/data:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/eval\(/gi, '')
        .replace(/exec\(/gi, '')
        .replace(/Function\(/gi, '')
        .replace(/document\./gi, '')
        .replace(/window\./gi, '')
        .replace(/global\./gi, '')
        .replace(/self\./gi, '')
        .replace(/top\./gi, '')
        .replace(/parent\./gi, '')
        .replace(/frames\./gi, '')
        .replace(/\x00/g, '')
        .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
        .substring(0, 1000); // Limit length to prevent memory issues
    }
    
    if (Array.isArray(data)) {
      // Limit array size to prevent memory issues
      if (data.length > 1000) {
        console.warn('Array size limit exceeded, truncating');
        data = data.slice(0, 1000);
      }
      return data.map(item => this.sanitizeOutput(item));
    }
    
    if (typeof data === 'object') {
      const sanitized = {};
      
      // Limit object depth to prevent deep nesting attacks
      const maxDepth = 10;
      const sanitizeObject = (obj, depth = 0) => {
        if (depth > maxDepth) {
          return { error: 'Object too deep - potential attack' };
        }
        
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          // Skip potentially dangerous keys
          if (key.includes('password') || key.includes('secret') || key.includes('token') || 
              key.includes('key') || key.includes('credential') || key.includes('auth')) {
            result[key] = '***';
          } else {
            result[key] = sanitizeValue(value, depth + 1);
          }
        }
        return result;
      };
      
      const sanitizeValue = (value, depth) => {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') return this.sanitizeOutput(value);
        if (Array.isArray(value)) return value.map(item => sanitizeValue(item, depth));
        if (typeof value === 'object') return sanitizeObject(value, depth);
        return value;
      };
      
      return sanitizeObject(data);
    }
    
    return data;
  }
}

/**
 * Create and start a job processor
 */
export const createJobProcessor = (registry, options = {}) => {
  const processor = new JobProcessor(registry, options);
  processor.start();
  return processor;
};