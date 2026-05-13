/**
 * Preset Schema Definition
 * Defines the structure and validation for Zsiistant presets
 */

/**
 * Base preset schema
 * Defines the core structure for all presets
 */
export const presetSchema = {
  id: { type: 'string', format: 'uuid', required: false }, // Auto-generated on create
  name: { type: 'string', minLength: 1, maxLength: 100, description: "Display name of the preset" },
  description: { type: 'string', minLength: 10, maxLength: 500, description: "Detailed description of the preset's purpose and features" },
  category: { 
    type: 'string', 
    enum: [
      'productivity', 'education', 'communication', 'development', 
      'research', 'entertainment', 'automation', 'business', 'other'
    ], 
    description: "Category for organization and filtering" 
  },
  
  // Configuration template - this defines what settings are included
  configTemplate: {
    // Agent configurations
    agents: [
      {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string', minLength: 1, maxLength: 50 },
        description: { type: 'string', minLength: 5, maxLength: 200 },
        model: { type: 'string', default: 'qwen3:1.7b' },
        systemPrompt: { type: 'string', minLength: 10, maxLength: 2000 },
        temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.7 },
        maxTokens: { type: 'number', minimum: 100, maximum: 4000, default: 2000 },
        tools: { type: 'array', items: { type: 'string' }, default: [] }
      }
    ],
    
    // Global settings
    settings: {
      defaultModel: { type: 'string', default: 'qwen3:1.7b' },
      maxConversations: { type: 'number', minimum: 1, maximum: 10, default: 3 },
      autoSave: { type: 'boolean', default: true },
      enableMemory: { type: 'boolean', default: true },
      maxMemoryTokens: { type: 'number', minimum: 1000, maximum: 10000, default: 4000 }
    },
    
    // Tool configurations
    tools: {
      web_search: { 
        enabled: { type: 'boolean', default: false },
        maxResults: { type: 'number', minimum: 1, maximum: 10, default: 5 },
        timeout: { type: 'number', minimum: 5000, maximum: 30000, default: 10000 }
      },
      file_operations: {
        enabled: { type: 'boolean', default: true },
        allowedDirectories: { type: 'array', items: { type: 'string' }, default: ['/tmp', '/home'] },
        maxFileSize: { type: 'number', minimum: 1024, maximum: 10485760, default: 1048576 } // 1MB default
      },
      exec: {
        enabled: { type: 'boolean', default: false },
        allowedCommands: { type: 'array', items: { type: 'string' }, default: ['ls', 'cat', 'echo'] },
        timeout: { type: 'number', minimum: 1000, maximum: 30000, default: 5000 }
      }
    }
  },
  
  // Display and metadata
  icon: { type: 'string', nullable: true, description: "Icon identifier or URL" },
  tags: { type: 'array', items: { type: 'string' }, default: [], description: "Tags for searching and filtering" },
  isSystem: { type: 'boolean', default: false, description: "Whether this is a system preset that cannot be deleted" },
  isFeatured: { type: 'boolean', default: false, description: "Whether this preset should be featured prominently" },
  orderIndex: { type: 'number', default: 0, description: "Order for display in UI" },
  enabled: { type: 'boolean', default: true, description: "Whether this preset is currently enabled" },
  
  // Timestamps
  createdAt: { type: 'string', format: 'date-time', required: false },
  updatedAt: { type: 'string', format: 'date-time', required: false }
};

/**
 * Preset creation schema (subset without auto-generated fields)
 */
export const createPresetSchema = {
  name: presetSchema.name,
  description: presetSchema.description,
  category: presetSchema.category,
  configTemplate: presetSchema.configTemplate,
  icon: presetSchema.icon,
  tags: presetSchema.tags,
  isSystem: presetSchema.isSystem,
  isFeatured: presetSchema.isFeatured,
  orderIndex: presetSchema.orderIndex,
  enabled: presetSchema.enabled
};

/**
 * Preset update schema (all fields optional)
 */
export const updatePresetSchema = {
  name: { ...presetSchema.name, required: false },
  description: { ...presetSchema.description, required: false },
  category: { ...presetSchema.category, required: false },
  configTemplate: { ...presetSchema.configTemplate, required: false },
  icon: { ...presetSchema.icon, required: false },
  tags: { ...presetSchema.tags, required: false },
  isSystem: { ...presetSchema.isSystem, required: false },
  isFeatured: { ...presetSchema.isFeatured, required: false },
  orderIndex: { ...presetSchema.orderIndex, required: false },
  enabled: { ...presetSchema.enabled, required: false }
};

/**
 * Preset category enum
 */
export const presetCategories = [
  'productivity',
  'education', 
  'communication',
  'development',
  'research',
  'entertainment',
  'automation',
  'business',
  'other'
];

/**
 * Preset validation function
 */
export function validatePreset(preset, type = 'create') {
  const errors = [];
  
  // Validate required fields based on type
  if (type === 'create') {
    if (!preset.name || preset.name.trim().length === 0) {
      errors.push('Name is required');
    }
    if (!preset.description || preset.description.trim().length === 0) {
      errors.push('Description is required');
    }
    if (!preset.configTemplate || typeof preset.configTemplate !== 'object') {
      errors.push('Config template is required and must be an object');
    }
  }
  
  // Validate category
  if (preset.category && !presetCategories.includes(preset.category)) {
    errors.push(`Invalid category. Must be one of: ${presetCategories.join(', ')}`);
  }
  
  // Validate config template structure
  if (preset.configTemplate) {
    if (!preset.configTemplate.agents || !Array.isArray(preset.configTemplate.agents)) {
      errors.push('Config template must contain an agents array');
    }
    
    // Validate each agent
    preset.configTemplate.agents.forEach((agent, index) => {
      if (!agent.name || agent.name.trim().length === 0) {
        errors.push(`Agent ${index + 1}: Name is required`);
      }
      if (!agent.systemPrompt || agent.systemPrompt.trim().length === 0) {
        errors.push(`Agent ${index + 1}: System prompt is required`);
      }
      if (agent.temperature && (agent.temperature < 0 || agent.temperature > 2)) {
        errors.push(`Agent ${index + 1}: Temperature must be between 0 and 2`);
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Default preset configurations
 */
export const defaultPresets = [
  {
    id: 'home-assistant',
    name: 'Home Assistant',
    description: 'Smart home automation and control agent with device management and scene control',
    category: 'automation',
    icon: '🏠',
    configTemplate: {
      agents: [
        {
          id: 'home-control',
          name: 'Home Control',
          description: 'Control your smart home devices and manage automation',
          model: 'qwen3:1.7b',
          systemPrompt: 'You are a smart home assistant. Help users control their devices, set scenes, and manage automation.',
          temperature: 0.7,
          tools: ['web_search']
        }
      ],
      settings: {
        defaultModel: 'qwen3:1.7b',
        maxConversations: 3,
        autoSave: true,
        enableMemory: true,
        maxMemoryTokens: 4000
      }
    }
  },
  {
    id: 'productivity-pro',
    name: 'Productivity Pro',
    description: 'Personal productivity assistant for task management, scheduling, and workflow optimization',
    category: 'productivity',
    icon: '⚡',
    configTemplate: {
      agents: [
        {
          id: 'task-manager',
          name: 'Task Manager',
          description: 'Help organize tasks, set priorities, and track progress',
          model: 'qwen3:1.7b',
          systemPrompt: 'You are a productivity expert. Help users manage tasks, set goals, and optimize workflows.',
          temperature: 0.5,
          tools: ['file_operations']
        }
      ],
      settings: {
        defaultModel: 'qwen3:1.7b',
        maxConversations: 5,
        autoSave: true,
        enableMemory: true,
        maxMemoryTokens: 4000
      }
    }
  }
];