/**
 * Preset Schema Definition
 * Defines the structure and validation for Zsiistant presets
 */

import { z } from 'zod';

/**
 * Base preset schema
 * Defines the core structure for all presets
 */
const presetSchema = z.object({
  id: z.string().uuid().optional(), // Auto-generated on create
  name: z.string().min(1).max(100).describe("Display name of the preset"),
  description: z.string().min(10).max(500).describe("Detailed description of the preset's purpose and features"),
  category: z.enum([
    'productivity', 'education', 'communication', 'development', 
    'research', 'entertainment', 'automation', 'business', 'other'
  ]).describe("Category for organization and filtering"),
  
  // Configuration template - this defines what settings are included
  config_template: z.object({
    // Agent configurations
    agents: z.array(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(50),
      description: z.string().min(5).max(200),
      model: z.string().default('qwen3:1.7b'),
      system_prompt: z.string().min(10).max(2000),
      temperature: z.number().min(0).max(2).default(0.7),
      max_tokens: z.number().min(100).max(4000).default(2000),
      tools: z.array(z.string()).optional(), // List of enabled tools
      memory_enabled: z.boolean().default(true),
      memory_window: z.number().min(100).max(10000).default(3000),
    })),
    
    // Provider configuration
    providers: z.object({
      primary: z.enum(['ollama', 'ollama-cloud', 'zai', 'anthropic', 'openai']),
      fallback: z.array(z.enum(['ollama', 'ollama-cloud', 'zai', 'anthropic', 'openai'])).optional(),
      config: z.record(z.any()).optional(), // Provider-specific config
    }),
    
    // System settings
    settings: z.object({
      webhook_enabled: z.boolean().default(false),
      webhook_url: z.string().url().optional(),
      rate_limit_enabled: z.boolean().default(true),
      rate_limit_requests: z.number().min(1).max(1000).default(100),
      rate_limit_window: z.number().min(60).max(86400).default(3600), // in seconds
      cors_enabled: z.boolean().default(true),
      cors_origins: z.array(z.string()).default(['*']),
    }),
    
    // Feature flags
    features: z.object({
      streaming_responses: z.boolean().default(true),
      message_history: z.boolean().default(true),
      agent_memory: z.boolean().default(true),
      tool_execution: z.boolean().default(true),
      background_jobs: z.boolean().default(true),
      token_tracking: z.boolean().default(true),
    }),
  }).describe("Configuration template defining all preset settings"),
  
  // Metadata
  created_at: z.string().datetime().optional(), // Auto-generated on create
  updated_at: z.string().datetime().optional(), // Auto-generated on update
  is_active: z.boolean().default(true),
  version: z.string().default('1.0.0'),
  
  // Preset type - defines how it's used
  preset_type: z.enum(['template', 'ready-to-use', 'preset']).default('template'),
  
  // Tags for discovery and organization
  tags: z.array(z.string()).default([]),
  
  // Dependencies or requirements
  requires: z.object({
    min_api_version: z.string().default('1.0.0'),
    optional_features: z.array(z.string()).optional(),
    excludes: z.array(z.string()).optional(), // Presets that conflict with this one
  }).optional(),
  
  // Author information
  author: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    organization: z.string().optional(),
  }).optional(),
  
  // Usage instructions
  usage_instructions: z.string().max(2000).optional(),
  
  // Configuration examples
  examples: z.array(z.object({
    title: z.string(),
    description: z.string(),
    config_snapshot: z.record(z.any()),
  })).optional(),
  
  // Migration instructions if this preset updates existing ones
  migration_notes: z.string().max(1000).optional(),
}).describe("Complete preset schema with all configuration options");

/**
 * Preset creation schema (without auto-generated fields)
 */
const createPresetSchema = presetSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

/**
 * Preset update schema (only updatable fields)
 */
const updatePresetSchema = presetSchema.partial().extend({
  id: true, // Required for updates
}).omit({
  created_at: true,
});

/**
 * Preset template schema for creating new preset templates
 */
const presetTemplateSchema = presetSchema.extend({
  preset_type: z.literal('template'),
  is_customizable: z.boolean().default(true),
  base_presets: z.array(z.string()).optional(), // Base presets this extends
}).omit({
  id: true,
  created_at: true,
});

/**
 * Built-in preset definitions
 */
const builtInPresets = {
  'home-assistant': {
    name: 'Home Assistant',
    description: 'Smart home automation preset for controlling IoT devices and home automation systems',
    category: 'automation',
    preset_type: 'ready-to-use',
    config_template: {
      agents: [
        {
          id: 'home-assistant-controller',
          name: 'Home Assistant Controller',
          description: 'Controls smart home devices and automations',
          model: 'qwen3:1.7b',
          system_prompt: 'You are a Home Assistant expert that helps users control smart home devices, manage automations, and provide insights into home status. You can read device states, control lights, thermostats, switches, and other smart home devices.',
          temperature: 0.3,
          max_tokens: 1500,
          tools: ['read', 'write', 'web_search'],
          memory_enabled: true,
          memory_window: 2000,
        }
      ],
      providers: {
        primary: 'ollama',
        config: {
          host: 'localhost',
          port: 11434,
          model: 'qwen3:1.7b'
        }
      },
      settings: {
        rate_limit_enabled: true,
        rate_limit_requests: 50,
        rate_limit_window: 3600,
        webhook_enabled: true,
        webhook_url: 'https://your-homeassistant-url.com/webhook',
      },
      features: {
        streaming_responses: true,
        message_history: true,
        agent_memory: true,
        tool_execution: true,
        background_jobs: false,
        token_tracking: true,
      }
    },
    tags: ['smart-home', 'automation', 'iot', 'home-assistant'],
    usage_instructions: 'Connect to your Home Assistant instance via webhook to receive device status updates and send commands.',
  },
  
  'productivity-pro': {
    name: 'Productivity Pro',
    description: 'Comprehensive productivity suite for task management, scheduling, and workflow optimization',
    category: 'productivity',
    preset_type: 'ready-to-use',
    config_template: {
      agents: [
        {
          id: 'task-manager',
          name: 'Task Manager',
          description: 'Helps organize tasks, set priorities, and track progress',
          model: 'qwen3:1.7b',
          system_prompt: 'You are a professional task manager and productivity expert. Help users organize tasks, set priorities, track progress, and optimize workflows.',
          temperature: 0.5,
          max_tokens: 2000,
          tools: ['read', 'write', 'exec'],
          memory_enabled: true,
          memory_window: 3000,
        },
        {
          id: 'scheduler',
          name: 'Smart Scheduler',
          description: 'Manages appointments, deadlines, and time blocking',
          model: 'qwen3:1.7b',
          system_prompt: 'You are an expert scheduler and time management assistant. Help users manage appointments, deadlines, and optimize their daily schedules.',
          temperature: 0.4,
          max_tokens: 1500,
          tools: ['read', 'write'],
          memory_enabled: true,
          memory_window: 2500,
        }
      ],
      providers: {
        primary: 'ollama',
        config: {
          host: 'localhost',
          port: 11434,
          model: 'qwen3:1.7b'
        }
      },
      settings: {
        rate_limit_enabled: true,
        rate_limit_requests: 200,
        rate_limit_window: 3600,
        webhook_enabled: false,
      },
      features: {
        streaming_responses: true,
        message_history: true,
        agent_memory: true,
        tool_execution: true,
        background_jobs: true,
        token_tracking: true,
      }
    },
    tags: ['productivity', 'task-management', 'scheduling', 'workflow'],
    usage_instructions: 'Use the Task Manager for organizing work and the Smart Scheduler for managing your time and appointments.',
  },
  
  'content-creator': {
    name: 'Content Creator',
    description: 'Specialized tools and agents for content creation, writing, and media production',
    category: 'entertainment',
    preset_type: 'ready-to-use',
    config_template: {
      agents: [
        {
          id: 'content-writer',
          name: 'Content Writer',
          description: 'Creates blog posts, articles, and marketing content',
          model: 'qwen3:1.7b',
          system_prompt: 'You are a professional content writer and copywriter. Create engaging blog posts, articles, marketing content, and other written materials.',
          temperature: 0.8,
          max_tokens: 3000,
          tools: ['read', 'write', 'web_search'],
          memory_enabled: true,
          memory_window: 4000,
        },
        {
          id: 'media-producer',
          name: 'Media Producer',
          description: 'Creates and edits multimedia content',
          model: 'qwen3:1.7b',
          system_prompt: 'You are a creative media producer and editor. Help with multimedia content creation, editing, and production workflows.',
          temperature: 0.7,
          max_tokens: 2500,
          tools: ['read', 'write', 'exec'],
          memory_enabled: true,
          memory_window: 3500,
        }
      ],
      providers: {
        primary: 'ollama',
        config: {
          host: 'localhost',
          port: 11434,
          model: 'qwen3:1.7b'
        }
      },
      settings: {
        rate_limit_enabled: true,
        rate_limit_requests: 150,
        rate_limit_window: 3600,
        webhook_enabled: false,
      },
      features: {
        streaming_responses: true,
        message_history: true,
        agent_memory: true,
        tool_execution: true,
        background_jobs: true,
        token_tracking: true,
      }
    },
    tags: ['content', 'writing', 'media', 'creativity'],
    usage_instructions: 'Use Content Writer for text creation and Media Producer for multimedia projects and editing.',
  }
};

export {
  presetSchema,
  createPresetSchema,
  updatePresetSchema,
  presetTemplateSchema,
  builtInPresets,
};