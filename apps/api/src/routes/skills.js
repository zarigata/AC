/**
 * Skill Management Routes - Install, manage, and monitor skill packages
 */

import { applyRateLimit } from "../middleware/security.js";
import { createSkillManager, getGlobalSkillManager } from "../skillManager.js";
import { validateSkillPackage, createSkillSchema, defaultSkillTemplates } from "../schemas/skillSchema.js";
import { readRequestBody, sendJson, sendError } from "../utils/responses.js";

/**
 * Handle skill installation
 */
export const handleInstallSkill = async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/api/skills/install') {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    const body = await readRequestBody(request);
    const { skill, options = {} } = body;
    
    if (!skill) {
      sendError(response, 400, 'Skill package is required');
      return true;
    }
    
    // Validate skill package
    const validation = validateSkillPackage(skill);
    if (!validation.isValid) {
      sendError(response, 400, `Skill validation failed: ${validation.errors.join(', ')}`);
      return true;
    }
    
    // Get skill manager
    const skillManager = getGlobalSkillManager();
    if (!skillManager) {
      const registry = request.registry; // Assuming registry is attached to request
      const newSkillManager = createSkillManager(registry);
      await newSkillManager.initialize();
    }
    
    // Install skill
    const result = await skillManager.installSkill(skill, options);
    
    sendJson(response, 201, {
      success: true,
      message: 'Skill installed successfully',
      skill: result.skill,
      installationId: result.installationId
    });
    
    return true;
    
  } catch (error) {
    console.error('Skill installation error:', error);
    sendError(response, 500, error.message || 'Failed to install skill');
    return true;
  }
};

/**
 * Handle skill uninstallation
 */
export const handleUninstallSkill = async (request, response, skillName) => {
  if (request.method !== 'DELETE' || request.url !== `/api/skills/${encodeURIComponent(skillName)}`) {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    if (!skillName) {
      sendError(response, 400, 'Skill name is required');
      return true;
    }
    
    // Get skill manager
    const skillManager = getGlobalSkillManager();
    if (!skillManager) {
      sendError(response, 503, 'Skill manager not available');
      return true;
    }
    
    // Check if skill exists
    const skill = await skillManager.getSkill(skillName);
    if (!skill) {
      sendError(response, 404, `Skill '${skillName}' not found`);
      return true;
    }
    
    // Check if skill is installed
    if (!skill.installation) {
      sendError(response, 400, `Skill '${skillName}' is not installed`);
      return true;
    }
    
    const body = await readRequestBody(request);
    const options = body.options || {};
    
    // Uninstall skill
    const result = await skillManager.uninstallSkill(skillName, options);
    
    sendJson(response, 200, {
      success: true,
      message: 'Skill uninstalled successfully',
      skillName: result.skillName,
      installationId: result.installationId
    });
    
    return true;
    
  } catch (error) {
    console.error('Skill uninstallation error:', error);
    sendError(response, 500, error.message || 'Failed to uninstall skill');
    return true;
  }
};

/**
 * Handle skill retrieval
 */
export const handleGetSkill = async (request, response, skillName) => {
  if (request.method !== 'GET' || request.url !== `/api/skills/${encodeURIComponent(skillName)}`) {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    if (!skillName) {
      sendError(response, 400, 'Skill name is required');
      return true;
    }
    
    // Get skill manager
    const skillManager = getGlobalSkillManager();
    if (!skillManager) {
      sendError(response, 503, 'Skill manager not available');
      return true;
    }
    
    const skill = await skillManager.getSkill(skillName);
    
    sendJson(response, 200, {
      success: true,
      skill
    });
    
    return true;
    
  } catch (error) {
    console.error('Skill retrieval error:', error);
    sendError(response, 404, error.message || 'Skill not found');
    return true;
  }
};

/**
 * Handle skill listing
 */
export const handleListSkills = async (request, response) => {
  if (request.method !== 'GET' || request.url !== '/api/skills') {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    const url = new URL(request.url, `http://${request.headers.host}`);
    const category = url.searchParams.get('category');
    const difficulty = url.searchParams.get('difficulty');
    const installed = url.searchParams.get('installed');
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const offset = parseInt(url.searchParams.get('offset')) || 0;
    
    // Get skill manager
    const skillManager = getGlobalSkillManager();
    if (!skillManager) {
      sendError(response, 503, 'Skill manager not available');
      return true;
    }
    
    // Build filter object
    const filter = {};
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;
    if (installed !== null) filter.installed = installed === 'true';
    
    // Get skills
    let skills = await skillManager.listSkills(filter);
    
    // Apply pagination
    const paginatedSkills = skills.slice(offset, offset + limit);
    
    // Get statistics
    const stats = await skillManager.getSkillStats();
    
    sendJson(response, 200, {
      success: true,
      skills: paginatedSkills,
      pagination: {
        total: skills.length,
        limit,
        offset,
        hasMore: offset + limit < skills.length
      },
      stats,
      availableCategories: ['communication', 'productivity', 'development', 'research', 'entertainment', 'automation', 'business', 'education', 'utilities', 'integration'],
      availableDifficulties: ['beginner', 'intermediate', 'advanced', 'expert']
    });
    
    return true;
    
  } catch (error) {
    console.error('Skill listing error:', error);
    sendError(response, 500, error.message || 'Failed to list skills');
    return true;
  }
};

/**
 * Handle skill statistics
 */
export const handleSkillStats = async (request, response) => {
  if (request.method !== 'GET' || request.url !== '/api/skills/stats') {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    // Get skill manager
    const skillManager = getGlobalSkillManager();
    if (!skillManager) {
      sendError(response, 503, 'Skill manager not available');
      return true;
    }
    
    const stats = await skillManager.getSkillStats();
    const installedSkills = await skillManager.getInstalledSkills();
    
    sendJson(response, 200, {
      success: true,
      stats,
      installedSkills: installedSkills.slice(0, 20), // Limit to 20 most recent
      timestamp: Date.now()
    });
    
    return true;
    
  } catch (error) {
    console.error('Skill statistics error:', error);
    sendError(response, 500, error.message || 'Failed to get skill statistics');
    return true;
  }
};

/**
 * Handle default skills installation
 */
export const handleInstallDefaultSkills = async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/api/skills/default/install') {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    // Get skill manager
    const skillManager = getGlobalSkillManager();
    if (!skillManager) {
      sendError(response, 503, 'Skill manager not available');
      return true;
    }
    
    // Install default skills
    await skillManager.installDefaultSkills();
    
    sendJson(response, 200, {
      success: true,
      message: 'Default skills installed successfully',
      installedSkills: defaultSkillTemplates.map(t => t.name)
    });
    
    return true;
    
  } catch (error) {
    console.error('Default skills installation error:', error);
    sendError(response, 500, error.message || 'Failed to install default skills');
    return true;
  }
};

/**
 * Handle skill dependency check
 */
export const handleSkillDependencies = async (request, response, skillName) => {
  if (request.method !== 'GET' || request.url !== `/api/skills/${encodeURIComponent(skillName)}/dependencies`) {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    if (!skillName) {
      sendError(response, 400, 'Skill name is required');
      return true;
    }
    
    // Get skill manager
    const skillManager = getGlobalSkillManager();
    if (!skillManager) {
      sendError(response, 503, 'Skill manager not available');
      return true;
    }
    
    const dependents = await skillManager.getSkillDependents(skillName);
    
    sendJson(response, 200, {
      success: true,
      skillName,
      dependents,
      canUninstall: dependents.length === 0
    });
    
    return true;
    
  } catch (error) {
    console.error('Skill dependencies check error:', error);
    sendError(response, 500, error.message || 'Failed to check skill dependencies');
    return true;
  }
};

/**
 * Handle skill search
 */
export const handleSearchSkills = async (request, response) => {
  if (request.method !== 'GET' || request.url !== '/api/skills/search') {
    return false;
  }
  
  try {
    // Apply rate limiting
    if (!applyRateLimit(request, response)) {
      return true; // Rate limit exceeded, response already sent
    }
    
    const url = new URL(request.url, `http://${request.headers.host}`);
    const query = url.searchParams.get('q');
    const category = url.searchParams.get('category');
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    
    if (!query) {
      sendError(response, 400, 'Search query is required');
      return true;
    }
    
    // Get skill manager
    const skillManager = getGlobalSkillManager();
    if (!skillManager) {
      sendError(response, 503, 'Skill manager not available');
      return true;
    }
    
    // Get all skills and filter
    let skills = await skillManager.listSkills();
    
    // Filter by search query
    const searchQuery = query.toLowerCase();
    skills = skills.filter(skill => 
      skill.name.toLowerCase().includes(searchQuery) ||
      skill.description.toLowerCase().includes(searchQuery) ||
      (skill.tags && skill.tags.some(tag => tag.toLowerCase().includes(searchQuery)))
    );
    
    // Filter by category if specified
    if (category) {
      skills = skills.filter(skill => skill.category === category);
    }
    
    // Sort by relevance and limit results
    skills.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const queryLower = searchQuery;
      
      const aExact = aName === queryLower;
      const bExact = bName === queryLower;
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      const aStarts = aName.startsWith(queryLower);
      const bStarts = bName.startsWith(queryLower);
      
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      
      // Then by name
      return a.name.localeCompare(b.name);
    });
    
    const results = skills.slice(0, limit);
    
    sendJson(response, 200, {
      success: true,
      query,
      results,
      total: results.length,
      limit
    });
    
    return true;
    
  } catch (error) {
    console.error('Skill search error:', error);
    sendError(response, 500, error.message || 'Failed to search skills');
    return true;
  }
};

/**
 * Register skill management routes
 */
export function registerSkillRoutes(server, registry, providers, failoverChains, settings) {
  // Initialize skill manager if not already initialized
  if (!getGlobalSkillManager()) {
    const skillManager = createSkillManager(registry);
    skillManager.initialize().catch(error => {
      console.error('Failed to initialize SkillManager:', error);
    });
  }
  
  // Skill installation endpoint
  server.on('request', async (request, response) => {
    if (await handleInstallSkill(request, response)) {
      return;
    }
    
    if (await handleListSkills(request, response)) {
      return;
    }
    
    if (await handleSkillStats(request, response)) {
      return;
    }
    
    if (await handleInstallDefaultSkills(request, response)) {
      return;
    }
    
    if (await handleSearchSkills(request, response)) {
      return;
    }
    
    // Handle skill-specific routes with URL patterns
    const skillMatch = request.url?.match(/^\/api\/skills\/([a-z][a-z0-9-]*[a-z0-9]+)$/);
    if (skillMatch) {
      const skillName = skillMatch[1];
      
      if (request.method === 'GET') {
        await handleGetSkill(request, response, skillName);
        return;
      }
      
      if (request.method === 'DELETE') {
        await handleUninstallSkill(request, response, skillName);
        return;
      }
    }
    
    // Handle dependencies endpoint
    const depsMatch = request.url?.match(/^\/api\/skills\/([a-z][a-z0-9-]*[a-z0-9]+)\/dependencies$/);
    if (depsMatch && request.method === 'GET') {
      await handleSkillDependencies(request, response, depsMatch[1]);
      return;
    }
    
    // If no skill handler matched, continue to other routes
    return false;
  });
}