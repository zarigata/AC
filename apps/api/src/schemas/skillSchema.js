/**
 * Skill Package Schema Definition
 * Defines the structure and validation for Zsiistant skill packages
 */

/**
 * Skill package version
 */
export const SKILL_VERSIONS = {
  CURRENT: '1.0.0',
  COMPATIBLE: ['1.0.0', '0.9.0', '0.8.0'],
  MINIMUM: '0.8.0'
};

/**
 * Skill categories
 */
export const SKILL_CATEGORIES = [
  'communication',
  'productivity', 
  'development',
  'research',
  'entertainment',
  'automation',
  'business',
  'education',
  'utilities',
  'integration'
];

/**
 * Skill difficulty levels
 */
export const SKILL_DIFFICULTY = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
  EXPERT: 'expert'
};

/**
 * Skill license types
 */
export const SKILL_LICENSES = [
  'MIT',
  'Apache-2.0',
  'GPL-3.0',
  'proprietary',
  'custom'
];

/**
 * Base skill package schema
 */
export const skillPackageSchema = {
  // Package metadata
  name: { 
    type: 'string', 
    minLength: 1, 
    maxLength: 100, 
    pattern: '^[a-z][a-z0-9-]*[a-z0-9]$',
    description: "Skill name (lowercase, hyphens allowed, no spaces)" 
  },
  
  version: { 
    type: 'string', 
    pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+(-[a-zA-Z0-9]+)?$',
    description: "Semantic version (e.g., 1.0.0, 1.2.3-beta)" 
  },
  
  description: { 
    type: 'string', 
    minLength: 10, 
    maxLength: 500, 
    description: "Detailed description of the skill's purpose and features" 
  },
  
  author: {
    name: { type: 'string', minLength: 1, maxLength: 100, description: "Author name" },
    email: { type: 'string', format: 'email', nullable: true, description: "Author email" },
    url: { type: 'string', format: 'uri', nullable: true, description: "Author website" }
  },
  
  // Classification
  category: { 
    type: 'string', 
    enum: SKILL_CATEGORIES,
    description: "Primary category for organization" 
  },
  
  difficulty: { 
    type: 'string', 
    enum: Object.values(SKILL_DIFFICULTY),
    default: SKILL_DIFFICULTY.INTERMEDIATE,
    description: "Skill complexity level" 
  },
  
  tags: { 
    type: 'array', 
    items: { type: 'string', minLength: 1, maxLength: 30 },
    maxItems: 10,
    default: [],
    description: "Search and filter tags" 
  },
  
  // Dependencies and compatibility
  dependencies: {
    zsiistant: { 
      type: 'string', 
      default: SKILL_VERSIONS.CURRENT,
      description: "Required Zsiistant version (semantic versioning)" 
    },
    skills: { 
      type: 'array', 
      items: { type: 'string' },
      default: [],
      description: "Required skill dependencies (skill names)" 
    },
    tools: { 
      type: 'array', 
      items: { type: 'string' },
      default: [],
      description: "Required tool dependencies (tool names)" 
    }
  },
  
  // License and distribution
  license: { 
    type: 'string', 
    enum: SKILL_LICENSES,
    default: 'MIT',
    description: "License type" 
  },
  
  repository: { 
    type: 'string', 
    format: 'uri', 
    nullable: true,
    description: "Source code repository URL" 
  },
  
  homepage: { 
    type: 'string', 
    format: 'uri', 
    nullable: true,
    description: "Skill homepage or documentation" 
  },
  
  // Icon and assets
  icon: { 
    type: 'string', 
    nullable: true,
    description: "Icon identifier or URL" 
  },
  
  assets: {
    scripts: { 
      type: 'array', 
      items: { type: 'string' },
      default: [],
      description: "Additional script files" 
    },
    templates: { 
      type: 'array', 
      items: { type: 'string' },
      default: [],
      description: "Template files" 
    },
    data: { 
      type: 'array', 
      items: { type: 'string' },
      default: [],
      description: "Data files" 
    }
  },
  
  // Core skill configuration
  config: {
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
    
    // Tool configurations
    tools: [
      {
        id: { type: 'string', format: 'uuid' },
        type: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 50 },
        description: { type: 'string', minLength: 5, maxLength: 200 },
        config: { type: 'object' },
        enabled: { type: 'boolean', default: true }
      }
    ],
    
    // Presets
    presets: [
      {
        id: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 50 },
        description: { type: 'string', minLength: 5, maxLength: 200 },
        configTemplate: { type: 'object' },
        icon: { type: 'string', nullable: true },
        category: { type: 'string' },
        enabled: { type: 'boolean', default: true }
      }
    ]
  },
  
  // Behavior and lifecycle
  behavior: {
    autoStart: { type: 'boolean', default: false },
    persistent: { type: 'boolean', default: true },
    concurrent: { type: 'boolean', default: true },
    maxInstances: { type: 'number', minimum: 1, maximum: 10, default: 1 }
  },
  
  // Installation configuration
  install: {
    configPrompts: { 
      type: 'array', 
      items: {
        key: { type: 'string' },
        label: { type: 'string' },
        type: { type: 'string', enum: ['text', 'select', 'number', 'boolean'] },
        required: { type: 'boolean', default: false },
        default: { type: 'any' },
        options: { type: 'array', items: { type: 'string' }, default: [] },
        description: { type: 'string' }
      },
      default: []
    },
    
    postInstall: { 
      type: 'string', 
      nullable: true,
      description: "Script to run after installation" 
    },
    
    preUninstall: { 
      type: 'string', 
      nullable: true,
      description: "Script to run before uninstallation" 
    },
    
    upgradeStrategy: { 
      type: 'string', 
      enum: ['preserve', 'reset', 'migrate'],
      default: 'preserve',
      description: "How to handle configuration during upgrades" 
    }
  },
  
  // Performance and resource limits
  limits: {
    maxMemory: { type: 'number', minimum: 0, maximum: 1024, default: 128, description: "Max memory in MB" },
    maxCpu: { type: 'number', minimum: 0, maximum: 100, default: 10, description: "Max CPU percentage" },
    timeout: { type: 'number', minimum: 1000, maximum: 300000, default: 30000, description: "Timeout in ms" },
    maxRetries: { type: 'number', minimum: 0, maximum: 5, default: 3, description: "Max retry attempts" }
  },
  
  // Security and permissions
  permissions: {
    fileAccess: { 
      type: 'array', 
      items: { type: 'string' },
      default: [],
      description: "Allowed file system paths" 
    },
    networkAccess: { 
      type: 'boolean', 
      default: false,
      description: "Allow network access" 
    },
    externalApiKeys: { 
      type: 'array', 
      items: { type: 'string' },
      default: [],
      description: "Required external API keys" 
    }
  },
  
  // Installation metadata
  metadata: {
    createdAt: { type: 'string', format: 'date-time', required: false },
    updatedAt: { type: 'string', format: 'date-time', required: false },
    installedAt: { type: 'string', format: 'date-time', required: false },
    updatedAt: { type: 'string', format: 'date-time', required: false },
    size: { type: 'number', minimum: 0, description: "Package size in bytes" },
    checksum: { type: 'string', description: "SHA256 checksum" },
    downloadCount: { type: 'number', minimum: 0, default: 0 },
    rating: { type: 'number', minimum: 0, maximum: 5, default: 0 },
    reviewCount: { type: 'number', minimum: 0, default: 0 }
  }
};

/**
 * Skill creation schema (without auto-generated fields)
 */
export const createSkillSchema = {
  name: skillPackageSchema.name,
  version: skillPackageSchema.version,
  description: skillPackageSchema.description,
  author: skillPackageSchema.author,
  category: skillPackageSchema.category,
  difficulty: skillPackageSchema.difficulty,
  tags: skillPackageSchema.tags,
  dependencies: skillPackageSchema.dependencies,
  license: skillPackageSchema.license,
  repository: skillPackageSchema.repository,
  homepage: skillPackageSchema.homepage,
  icon: skillPackageSchema.icon,
  assets: skillPackageSchema.assets,
  config: skillPackageSchema.config,
  behavior: skillPackageSchema.behavior,
  install: skillPackageSchema.install,
  limits: skillPackageSchema.limits,
  permissions: skillPackageSchema.permissions
};

/**
 * Skill update schema (all fields optional)
 */
export const updateSkillSchema = {
  name: { ...skillPackageSchema.name, required: false },
  version: { ...skillPackageSchema.version, required: false },
  description: { ...skillPackageSchema.description, required: false },
  author: { ...skillPackageSchema.author, required: false },
  category: { ...skillPackageSchema.category, required: false },
  difficulty: { ...skillPackageSchema.difficulty, required: false },
  tags: { ...skillPackageSchema.tags, required: false },
  dependencies: { ...skillPackageSchema.dependencies, required: false },
  license: { ...skillPackageSchema.license, required: false },
  repository: { ...skillPackageSchema.repository, required: false },
  homepage: { ...skillPackageSchema.homepage, required: false },
  icon: { ...skillPackageSchema.icon, required: false },
  assets: { ...skillPackageSchema.assets, required: false },
  config: { ...skillPackageSchema.config, required: false },
  behavior: { ...skillPackageSchema.behavior, required: false },
  install: { ...skillPackageSchema.install, required: false },
  limits: { ...skillPackageSchema.limits, required: false },
  permissions: { ...skillPackageSchema.permissions, required: false }
};

/**
 * Validate skill package
 */
export function validateSkillPackage(skill, type = 'create') {
  const errors = [];
  
  // Validate required fields based on type
  if (type === 'create') {
    if (!skill.name || skill.name.trim().length === 0) {
      errors.push('Name is required');
    }
    if (!skill.version || skill.version.trim().length === 0) {
      errors.push('Version is required (semantic versioning)');
    }
    if (!skill.description || skill.description.trim().length === 0) {
      errors.push('Description is required');
    }
    if (!skill.author || !skill.author.name || skill.author.name.trim().length === 0) {
      errors.push('Author name is required');
    }
  }
  
  // Validate name format
  if (skill.name && !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(skill.name)) {
    errors.push('Name must be lowercase, start/end with letter/number, can contain hyphens');
  }
  
  // Validate version format
  if (skill.version && !/^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9]+)?$/.test(skill.version)) {
    errors.push('Version must follow semantic versioning (e.g., 1.0.0, 1.2.3-beta)');
  }
  
  // Validate category
  if (skill.category && !SKILL_CATEGORIES.includes(skill.category)) {
    errors.push(`Invalid category. Must be one of: ${SKILL_CATEGORIES.join(', ')}`);
  }
  
  // Validate difficulty
  if (skill.difficulty && !Object.values(SKILL_DIFFICULTY).includes(skill.difficulty)) {
    errors.push(`Invalid difficulty. Must be one of: ${Object.values(SKILL_DIFFICULTY).join(', ')}`);
  }
  
  // Validate license
  if (skill.license && !SKILL_LICENSES.includes(skill.license)) {
    errors.push(`Invalid license. Must be one of: ${SKILL_LICENSES.join(', ')}`);
  }
  
  // Validate config structure
  if (skill.config) {
    if (skill.config.agents && !Array.isArray(skill.config.agents)) {
      errors.push('Config agents must be an array');
    }
    
    if (skill.config.tools && !Array.isArray(skill.config.tools)) {
      errors.push('Config tools must be an array');
    }
    
    if (skill.config.presets && !Array.isArray(skill.config.presets)) {
      errors.push('Config presets must be an array');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Check skill compatibility
 */
export function checkSkillCompatibility(skill, zsiistantVersion = SKILL_VERSIONS.CURRENT) {
  const errors = [];
  
  // Check Zsiistant version compatibility
  if (skill.dependencies.zsiistant) {
    if (!isVersionCompatible(zsiistantVersion, skill.dependencies.zsiistant)) {
      errors.push(`Zsiistant version incompatible: required ${skill.dependencies.zsiistant}, have ${zsiistantVersion}`);
    }
  }
  
  // Check dependency installation
  if (skill.dependencies && skill.dependencies.skills && skill.dependencies.skills.length > 0) {
    // In a real implementation, this would check installed skills
    // For now, just validate the dependency names
    skill.dependencies.skills.forEach(dep => {
      if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(dep)) {
        errors.push(`Invalid skill dependency name: ${dep}`);
      }
    });
  }
  
  return {
    isCompatible: errors.length === 0,
    errors
  };
}

/**
 * Check if versions are compatible
 */
function isVersionCompatible(current, required) {
  // Simple version compatibility check (supports semantic versioning)
  const currentParts = current.split('.').map(Number);
  const requiredParts = required.split('.').map(Number);
  
  // Check major version compatibility
  if (currentParts[0] !== requiredParts[0]) {
    return false;
  }
  
  // Check minor version (allow higher)
  if (currentParts[1] < requiredParts[1]) {
    return false;
  }
  
  // Check patch version (allow higher)
  if (currentParts[1] === requiredParts[1] && currentParts[2] < requiredParts[2]) {
    return false;
  }
  
  return true;
}

/**
 * Default skill templates
 */
export const defaultSkillTemplates = [
  {
    name: 'web-researcher',
    version: '1.0.0',
    description: 'Helps with web research and information gathering using advanced search techniques',
    author: { name: 'Zsiistant Team' },
    category: 'research',
    difficulty: SKILL_DIFFICULTY.INTERMEDIATE,
    license: 'MIT',
    dependencies: {
      zsiistant: '1.0.0',
      skills: [],
      tools: ['web_search']
    },
    config: {
      agents: [
        {
          id: 'research-assistant',
          name: 'Research Assistant',
          description: 'Helps with web research and information gathering',
          model: 'qwen3:1.7b',
          systemPrompt: 'You are a research assistant with expertise in web search and information analysis.',
          tools: ['web_search']
        }
      ]
    }
  },
  {
    name: 'code-reviewer',
    version: '1.0.0',
    description: 'Reviews code for quality, security, and best practices with comprehensive analysis',
    author: { name: 'Zsiistant Team' },
    category: 'development',
    difficulty: SKILL_DIFFICULTY.ADVANCED,
    license: 'MIT',
    dependencies: {
      zsiistant: '1.0.0',
      skills: [],
      tools: ['read', 'calculate']
    },
    config: {
      agents: [
        {
          id: 'code-reviewer',
          name: 'Code Reviewer',
          description: 'Reviews code for quality, security, and best practices',
          model: 'qwen3:1.7b',
          systemPrompt: 'You are an expert code reviewer focused on code quality, security, and best practices.',
          tools: ['read', 'calculate']
        }
      ]
    }
  },
  {
    name: 'social-media-poster',
    version: '1.0.0',
    description: 'Creates engaging social media content optimized for different platforms',
    author: { name: 'Zsiistant Team' },
    category: 'communication',
    difficulty: SKILL_DIFFICULTY.BEGINNER,
    license: 'MIT',
    dependencies: {
      zsiistant: '1.0.0',
      skills: [],
      tools: []
    },
    config: {
      agents: [
        {
          id: 'social-media-manager',
          name: 'Social Media Manager',
          description: 'Creates engaging social media content',
          model: 'qwen3:1.7b',
          systemPrompt: 'You are a social media marketing expert creating engaging content.',
          tools: []
        }
      ]
    }
  }
];