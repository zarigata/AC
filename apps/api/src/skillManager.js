/**
 * Skill Manager - Core skill package management system
 * Handles installation, uninstallation, and skill lifecycle
 */

import { open, Database } from "sqlite";
import sqlite3 from "sqlite3";
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { validateSkillPackage, checkSkillCompatibility, defaultSkillTemplates } from './schemas/skillSchema.js';

export class SkillManager {
  constructor(registry) {
    this.db = null;
    this.initialized = false;
    this.registry = registry;
    this.installedSkills = new Map();
    this.skillCache = new Map();
    this.downloadCache = new Map();
    this.maxCacheSize = 100;
    this.installQueue = [];
    this.isInstalling = false;
    
    // Security settings
    this.allowedFileExtensions = ['.js', '.json', '.txt', '.md', '.yaml', '.yml'];
    this.maxPackageSize = 10 * 1024 * 1024; // 10MB
    this.tempDir = process.env.TEMP_DIR || '/tmp/zsiistant-skills';
    
    // Performance tracking
    this.performanceMetrics = {
      totalDownloads: 0,
      totalInstalls: 0,
      totalUninstalls: 0,
      failedInstalls: 0,
      averageInstallTime: 0,
      skillsByCategory: {},
      skillsByStatus: {}
    };
  }

  /**
   * Initialize database connection and schema
   */
  async initialize() {
    if (this.initialized) return;

    this.db = await open({
      filename: process.env.ZSIISTANT_DB_PATH || "./data/zsiistant.sqlite",
      driver: sqlite3.Database
    });

    // Enable foreign keys
    await this.db.exec("PRAGMA foreign_keys = ON");

    // Create skill management schema
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS skill_packages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        version TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_email TEXT,
        author_url TEXT,
        license TEXT NOT NULL,
        repository TEXT,
        homepage TEXT,
        icon TEXT,
        size INTEGER DEFAULT 0,
        checksum TEXT,
        download_count INTEGER DEFAULT 0,
        rating REAL DEFAULT 0,
        review_count INTEGER DEFAULT 0,
        is_system BOOLEAN DEFAULT FALSE,
        is_enabled BOOLEAN DEFAULT TRUE,
        installed_at DATETIME,
        updated_at DATETIME,
        metadata TEXT DEFAULT "{}"
      );

      CREATE TABLE IF NOT EXISTS skill_dependencies (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        dependency_type TEXT NOT NULL, -- 'skill' or 'tool'
        dependency_name TEXT NOT NULL,
        version_constraint TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (skill_id) REFERENCES skill_packages(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_installations (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        version TEXT NOT NULL,
        status TEXT NOT NULL, -- 'pending', 'installing', 'installed', 'failed', 'uninstalling'
        install_path TEXT NOT NULL,
        config JSON,
        error_message TEXT,
        install_duration INTEGER,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (skill_id) REFERENCES skill_packages(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS skill_configurations (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        installation_id TEXT NOT NULL,
        user_id TEXT,
        config_data JSON NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (skill_id) REFERENCES skill_packages(id) ON DELETE CASCADE,
        FOREIGN KEY (installation_id) REFERENCES skill_installations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_skill_packages_name ON skill_packages(name);
      CREATE INDEX IF NOT EXISTS idx_skill_packages_category ON skill_packages(category);
      CREATE INDEX IF NOT EXISTS idx_skill_packages_enabled ON skill_packages(is_enabled);
      CREATE INDEX IF NOT EXISTS idx_skill_installations_status ON skill_installations(status);
      CREATE INDEX IF NOT EXISTS idx_skill_dependencies_skill_id ON skill_dependencies(skill_id);
      CREATE INDEX IF NOT EXISTS idx_skill_configurations_skill_id ON skill_configurations(skill_id);
    `);

    // Create temp directory if it doesn't exist
    const fs = await import('fs/promises');
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.warn('Could not create temp directory:', error.message);
    }

    // Load installed skills
    await this.loadInstalledSkills();
    
    this.initialized = true;
    console.log("SkillManager initialized");
  }

  /**
   * Load installed skills from database
   */
  async loadInstalledSkills() {
    try {
      const skills = await this.db.all(`
        SELECT sp.*, si.id as installation_id, si.status as installation_status,
               si.install_path, si.config as installation_config,
               si.created_at as installed_at, si.updated_at as updated_at
        FROM skill_packages sp
        LEFT JOIN skill_installations si ON sp.id = si.skill_id AND si.status = 'installed'
        WHERE sp.is_enabled = TRUE
        ORDER BY sp.name
      `);

      // Clear existing caches first
      this.installedSkills.clear();
      this.skillCache.clear();

      for (const skill of skills) {
        const skillData = {
          ...skill,
          config: skill.installation_config || skill.metadata ? JSON.parse(skill.metadata || '{}') : {},
          installation: {
            id: skill.installation_id,
            status: skill.installation_status,
            installPath: skill.install_path,
            installedAt: skill.installed_at
          }
        };
        
        this.installedSkills.set(skill.name, skillData);
        this.skillCache.set(skill.name, skillData);
      }

      console.log(`Loaded ${this.installedSkills.size} installed skills`);
      
    } catch (error) {
      console.error('Error loading installed skills:', error);
    }
  }

  /**
   * Clear all skills from database (for testing)
   */
  async clearAllSkills() {
    try {
      await this.db.run('DELETE FROM skill_installations');
      await this.db.run('DELETE FROM skill_dependencies');
      await this.db.run('DELETE FROM skill_packages');
      
      // Clear caches
      this.installedSkills.clear();
      this.skillCache.clear();
      
      console.log('Cleared all skills from database');
    } catch (error) {
      console.error('Error clearing skills:', error);
      throw error;
    }
  }

  /**
   * Install a skill package
   */
  async installSkill(skillPackage, options = {}) {
    if (!this.initialized) await this.initialize();

    const { validate = true, overwrite = false, autoConfigure = true } = options;
    
    // Validate skill package if requested
    if (validate) {
      const validation = validateSkillPackage(skillPackage);
      if (!validation.isValid) {
        throw new Error(`Skill validation failed: ${validation.errors.join(', ')}`);
      }
    }

    // Check compatibility
    const compatibility = checkSkillCompatibility(skillPackage);
    if (!compatibility.isCompatible) {
      throw new Error(`Skill compatibility check failed: ${compatibility.errors.join(', ')}`);
    }

    // Check if skill is already installed
    const existingSkill = this.installedSkills.get(skillPackage.name);
    if (existingSkill) {
      if (!overwrite) {
        throw new Error(`Skill '${skillPackage.name}' is already installed`);
      }
      // If overwriting, uninstall the existing one first
      try {
        await this.uninstallSkill(skillPackage.name, { keepConfig: false });
      } catch (error) {
        // If uninstall fails (e.g., skill not found), continue with installation
        if (!error.message.includes('not installed')) {
          throw error;
        }
      }
    }

    // Generate installation ID
    const installationId = `install_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let skillId = `skill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if skill already exists in database (might have been soft-deleted)
    const dbSkill = await this.db.get('SELECT id FROM skill_packages WHERE name = ?', [skillPackage.name]);
    
    if (dbSkill) {
      // Update existing skill instead of inserting new one
      await this.db.run(
        `UPDATE skill_packages 
         SET version = ?, description = ?, category = ?, difficulty = ?, author_name = ?, author_email = ?, author_url = ?,
             license = ?, repository = ?, homepage = ?, icon = ?, size = ?, checksum = ?, is_system = ?,
             updated_at = datetime('now'), metadata = ?
         WHERE id = ?`,
        [
          skillPackage.version,
          skillPackage.description,
          skillPackage.category,
          skillPackage.difficulty || 'intermediate',
          skillPackage.author.name,
          skillPackage.author.email || null,
          skillPackage.author.url || null,
          skillPackage.license || 'MIT',
          skillPackage.repository || null,
          skillPackage.homepage || null,
          skillPackage.icon || null,
          skillPackage.metadata?.size || 0,
          skillPackage.metadata?.checksum || '',
          skillPackage.is_system || false,
          JSON.stringify(skillPackage.metadata || {}),
          dbSkill.id
        ]
      );
      skillId = dbSkill.id; // Use the existing skill ID
    } else {
      // Create new installation record
      await this.db.run(
        `INSERT INTO skill_packages 
         (id, name, version, description, category, difficulty, author_name, author_email, author_url,
          license, repository, homepage, icon, size, checksum, is_system, installed_at, updated_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)`,
        [
          skillId,
          skillPackage.name,
          skillPackage.version,
          skillPackage.description,
          skillPackage.category,
          skillPackage.difficulty || 'intermediate',
          skillPackage.author.name,
          skillPackage.author.email || null,
          skillPackage.author.url || null,
          skillPackage.license || 'MIT',
          skillPackage.repository || null,
          skillPackage.homepage || null,
          skillPackage.icon || null,
          skillPackage.metadata?.size || 0,
          skillPackage.metadata?.checksum || '',
          skillPackage.is_system || false,
          JSON.stringify(skillPackage.metadata || {})
        ]
      );
    }

    // Create installation record
    const installPath = `${this.tempDir}/${skillPackage.name}-${skillPackage.version}`;
    await this.db.run(
      `INSERT INTO skill_installations 
       (id, skill_id, version, status, install_path, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        installationId,
        skillId,
        skillPackage.version,
        'installing',
        installPath,
        JSON.stringify(options.config || {})
      ]
    );

    // Add dependencies
    if (skillPackage.dependencies) {
      for (const [depType, deps] of Object.entries(skillPackage.dependencies)) {
        if (depType === 'skills' && Array.isArray(deps)) {
          for (const dep of deps) {
            await this.db.run(
              `INSERT INTO skill_dependencies 
               (id, skill_id, dependency_type, dependency_name, version_constraint)
               VALUES (?, ?, ?, ?, ?)`,
              [
                `dep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                skillId,
                'skill',
                dep,
                null
              ]
            );
          }
        }
      }
    }

    console.log(`🚀 Starting installation of ${skillPackage.name} v${skillPackage.version}`);

    try {
      // Perform installation
      await this.performInstallation(skillPackage, installPath, installationId, autoConfigure);

      // Update installation status to completed
      const installDuration = Date.now() - new Date().getTime();
      await this.db.run(
        `UPDATE skill_installations 
         SET status = 'installed', install_duration = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [installDuration, installationId]
      );

      // Update skill record
      await this.db.run(
        `UPDATE skill_packages 
         SET updated_at = datetime('now'), metadata = ?
         WHERE id = ?`,
        [JSON.stringify({ ...skillPackage.metadata, installedAt: new Date().toISOString() }), skillId]
      );

      // Update in-memory cache
      const skillData = {
        ...skillPackage,
        id: skillId,
        installation: {
          id: installationId,
          status: 'installed',
          installPath,
          installedAt: new Date().toISOString()
        }
      };

      this.installedSkills.set(skillPackage.name, skillData);
      this.skillCache.set(skillPackage.name, skillData);

      // Update performance metrics
      this.performanceMetrics.totalInstalls++;
      this.updatePerformanceMetrics('install', skillPackage);

      console.log(`✅ Skill installed successfully: ${skillPackage.name} v${skillPackage.version}`);

      return {
        success: true,
        skill: skillData,
        installationId
      };

    } catch (error) {
      // Update installation status to failed
      await this.db.run(
        `UPDATE skill_installations 
         SET status = 'failed', error_message = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [error.message, installationId]
      );

      // Update performance metrics
      this.performanceMetrics.failedInstalls++;
      this.updatePerformanceMetrics('fail', skillPackage);

      console.error(`❌ Skill installation failed: ${skillPackage.name}`, error);
      throw error;
    }
  }

  /**
   * Perform actual skill installation
   */
  async performInstallation(skillPackage, installPath, installationId, autoConfigure) {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Create installation directory
    try {
      await fs.mkdir(installPath, { recursive: true });
    } catch (error) {
      throw new Error(`Could not create installation directory: ${error.message}`);
    }

    // Create skill structure
    const skillDir = path.join(installPath, skillPackage.name);
    await fs.mkdir(skillDir, { recursive: true });

    // Write skill configuration
    const configPath = path.join(skillDir, 'skill-config.json');
    await fs.writeFile(configPath, JSON.stringify({
      name: skillPackage.name,
      version: skillPackage.version,
      description: skillPackage.description,
      config: skillPackage.config || {},
      behavior: skillPackage.behavior || {},
      permissions: skillPackage.permissions || {},
      createdAt: new Date().toISOString()
    }, null, 2));

    // Write assets if provided
    if (skillPackage.assets) {
      if (skillPackage.assets.scripts) {
        const scriptDir = path.join(skillDir, 'scripts');
        await fs.mkdir(scriptDir, { recursive: true });
        
        for (const script of skillPackage.assets.scripts) {
          const scriptPath = path.join(scriptDir, path.basename(script));
          await fs.writeFile(scriptPath, '// Skill script placeholder');
        }
      }

      if (skillPackage.assets.templates) {
        const templateDir = path.join(skillDir, 'templates');
        await fs.mkdir(templateDir, { recursive: true });
        
        for (const template of skillPackage.assets.templates) {
          const templatePath = path.join(templateDir, path.basename(template));
          await fs.writeFile(templatePath, 'Template content placeholder');
        }
      }
    }

    // Register agents if provided
    if (skillPackage.config && skillPackage.config.agents) {
      for (const agentConfig of skillPackage.config.agents) {
        await this.registry.createAgent({
          ...agentConfig,
          skillPackage: skillPackage.name
        });
      }
    }

    // Register tools if provided
    if (skillPackage.config && skillPackage.config.tools) {
      for (const toolConfig of skillPackage.config.tools) {
        // Tool registration would go here
        console.log(`Registering tool: ${toolConfig.name}`);
      }
    }

    // Create installation metadata
    const metadataPath = path.join(skillDir, '.metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify({
      installationId,
      installedAt: new Date().toISOString(),
      zsiistantVersion: process.env.ZSIISTANT_VERSION || '1.0.0',
      config: autoConfigure ? await this.generateSkillConfig(skillPackage) : {}
    }, null, 2));

    // Execute post-install script if provided
    if (skillPackage.install && skillPackage.install.postInstall) {
      try {
        await this.executeScript(skillPackage.install.postInstall, skillPackage);
      } catch (error) {
        console.warn('Post-install script failed:', error.message);
        // Don't fail the installation for post-install script errors
      }
    }
  }

  /**
   * Uninstall a skill
   */
  async uninstallSkill(skillName, options = {}) {
    if (!this.initialized) await this.initialize();

    const { keepConfig = false, validateDependents = true } = options;
    
    const skill = this.installedSkills.get(skillName);
    if (!skill) {
      throw new Error(`Skill '${skillName}' is not installed`);
    }

    // Check if other skills depend on this one
    if (validateDependents) {
      const dependents = await this.getSkillDependents(skillName);
      if (dependents.length > 0) {
        const dependentNames = dependents.map(d => d.name).join(', ');
        throw new Error(`Cannot uninstall: other skills depend on this skill: ${dependentNames}`);
      }
    }

    const installationId = skill.installation.id;
    const installPath = skill.installation.installPath;

    console.log(`🗑️ Starting uninstallation of ${skillName}`);

    try {
      // Mark installation as uninstalling
      await this.db.run(
        `UPDATE skill_installations 
         SET status = 'uninstalling', updated_at = datetime('now')
         WHERE id = ?`,
        [installationId]
      );

      // Execute pre-uninstall script if provided
      if (skill.install && skill.install.preUninstall) {
        try {
          await this.executeScript(skill.install.preUninstall, skill);
        } catch (error) {
          console.warn('Pre-uninstall script failed:', error.message);
        }
      }

      // Remove agents created by this skill
      if (skill.config && skill.config.agents) {
        for (const agent of skill.config.agents) {
          await this.registry.deleteAgent(agent.id);
        }
      }

      // Remove installation directory
      const fs = await import('fs/promises');
      try {
        if (installPath) {
          await fs.rm(installPath, { recursive: true, force: true });
        }
      } catch (error) {
        console.warn('Could not remove installation directory:', error.message);
      }

      // Update installation status
      await this.db.run(
        `UPDATE skill_installations 
         SET status = 'uninstalled', updated_at = datetime('now')
         WHERE id = ?`,
        [installationId]
      );

      // Remove from cache
      this.installedSkills.delete(skillName);
      this.skillCache.delete(skillName);

      // Update performance metrics
      this.performanceMetrics.totalUninstalls++;
      this.updatePerformanceMetrics('uninstall', skill);

      console.log(`✅ Skill uninstalled successfully: ${skillName}`);

      return {
        success: true,
        skillName,
        installationId
      };

    } catch (error) {
      // Update installation status back to installed
      await this.db.run(
        `UPDATE skill_installations 
         SET status = 'installed', updated_at = datetime('now')
         WHERE id = ?`,
        [installationId]
      );

      console.error(`❌ Skill uninstallation failed: ${skillName}`, error);
      throw error;
    }
  }

  /**
   * Get skill information
   */
  async getSkill(skillName) {
    if (!this.initialized) await this.initialize();

    // Check cache first
    if (this.skillCache.has(skillName)) {
      return this.skillCache.get(skillName);
    }

    // Check database
    const skill = await this.db.get(`
      SELECT sp.*, si.id as installation_id, si.status as installation_status,
             si.install_path, si.config as installation_config
      FROM skill_packages sp
      LEFT JOIN skill_installations si ON sp.id = si.skill_id AND si.status = 'installed'
      WHERE sp.name = ? AND sp.is_enabled = TRUE
    `, [skillName]);

    if (!skill) {
      throw new Error(`Skill '${skillName}' not found`);
    }

    const skillData = {
      ...skill,
      config: skill.installation_config || skill.metadata ? JSON.parse(skill.installation_config || skill.metadata || '{}') : {},
      installation: skill.installation_id ? {
        id: skill.installation_id,
        status: skill.installation_status,
        installPath: skill.install_path,
        installedAt: skill.installed_at
      } : null
    };

    // Cache the result
    this.skillCache.set(skillName, skillData);
    return skillData;
  }

  /**
   * List all skills (installed and available)
   */
  async listSkills(filter = {}) {
    if (!this.initialized) await this.initialize();

    let query = `
      SELECT sp.*, si.id as installation_id, si.status as installation_status,
             si.install_path, si.config as installation_config
      FROM skill_packages sp
      LEFT JOIN skill_installations si ON sp.id = si.skill_id AND si.status = 'installed'
    `;

    const params = [];
    
    // Apply filters
    if (filter.category) {
      query += ' WHERE sp.category = ?';
      params.push(filter.category);
    }
    
    if (filter.difficulty) {
      query += filter.category ? ' AND sp.difficulty = ?' : ' WHERE sp.difficulty = ?';
      params.push(filter.difficulty);
    }
    
    if (filter.installed !== undefined) {
      const condition = filter.installed ? ' IS NOT NULL' : ' IS NULL';
      query += filter.category || filter.difficulty ? ` AND si.id${condition}` : ` WHERE si.id${condition}`;
    }
    
    query += ' ORDER BY sp.name';

    const skills = await this.db.all(query, params);
    
    return skills.map(skill => ({
      ...skill,
      config: skill.installation_config || skill.metadata ? JSON.parse(skill.installation_config || skill.metadata || '{}') : {},
      installation: skill.installation_id ? {
        id: skill.installation_id,
        status: skill.installation_status,
        installPath: skill.install_path,
        installedAt: skill.installed_at
      } : null,
      isInstalled: skill.installation_id !== null
    }));
  }

  /**
   * Get installed skills
   */
  async getInstalledSkills() {
    const skills = await this.listSkills({ installed: true });
    return skills;
  }

  /**
   * Check skill dependencies
   */
  async getSkillDependents(skillName) {
    if (!this.initialized) await this.initialize();

    const dependents = await this.db.all(`
      SELECT DISTINCT sp.name, sp.version
      FROM skill_packages sp
      JOIN skill_dependencies sd ON sp.id = sd.skill_id
      JOIN skill_installations si ON sp.id = si.skill_id AND si.status = 'installed'
      WHERE sd.dependency_type = 'skill' AND sd.dependency_name = ?
    `, [skillName]);

    return dependents;
  }

  /**
   * Generate skill configuration
   */
  async generateSkillConfig(skillPackage) {
    const config = {};
    
    if (skillPackage.install && skillPackage.install.configPrompts) {
      for (const prompt of skillPackage.install.configPrompts) {
        // In a real implementation, this would prompt the user for input
        config[prompt.key] = prompt.default;
      }
    }
    
    return config;
  }

  /**
   * Execute skill script
   */
  async executeScript(scriptContent, skillPackage) {
    // In a real implementation, this would execute scripts in a sandboxed environment
    console.log(`Executing script for skill: ${skillPackage.name}`);
    console.log('Script content:', scriptContent);
    
    // For now, just simulate execution
    await setTimeout(1000);
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(action, skill) {
    switch (action) {
      case 'install':
        this.performanceMetrics.totalInstalls++;
        this.updateCategoryMetrics(skill.category, 'install');
        break;
      case 'uninstall':
        this.performanceMetrics.totalUninstalls++;
        this.updateCategoryMetrics(skill.category, 'uninstall');
        break;
      case 'fail':
        this.performanceMetrics.failedInstalls++;
        this.updateCategoryMetrics(skill.category, 'fail');
        break;
    }
  }

  /**
   * Update category-based metrics
   */
  updateCategoryMetrics(category, action) {
    if (!this.performanceMetrics.skillsByCategory[category]) {
      this.performanceMetrics.skillsByCategory[category] = { install: 0, uninstall: 0, fail: 0 };
    }
    this.performanceMetrics.skillsByCategory[category][action]++;
  }

  /**
   * Get skill manager statistics
   */
  async getSkillStats() {
    if (!this.initialized) await this.initialize();

    const [installedCount, totalSkills, downloads, installations] = await Promise.all([
      this.db.get('SELECT COUNT(*) as count FROM skill_packages WHERE is_enabled = TRUE AND is_system = FALSE'),
      this.db.get('SELECT COUNT(*) as count FROM skill_packages'),
      this.db.get('SELECT SUM(download_count) as total FROM skill_packages'),
      this.db.get('SELECT COUNT(*) as count FROM skill_installations WHERE status = "installed"')
    ]);

    return {
      totalSkills: totalSkills.count,
      installedSkills: installedCount.count,
      activeInstallations: installations.count,
      totalDownloads: downloads.total || 0,
      skillsByCategory: this.performanceMetrics.skillsByCategory,
      metrics: this.performanceMetrics
    };
  }

  /**
   * Install default skills
   */
  async installDefaultSkills() {
    if (!this.initialized) await this.initialize();

    console.log('🔧 Installing default skills...');
    
    for (const template of defaultSkillTemplates) {
      try {
        await this.installSkill(template);
      } catch (error) {
        console.warn(`Could not install default skill ${template.name}:`, error.message);
      }
    }
    
    console.log('✅ Default skills installation completed');
  }
}

// Export singleton instance
let globalSkillManager = null;

export function createSkillManager(registry) {
  if (!globalSkillManager) {
    globalSkillManager = new SkillManager(registry);
  }
  return globalSkillManager;
}

export function getGlobalSkillManager() {
  return globalSkillManager;
}