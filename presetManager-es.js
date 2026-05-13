/**
 * Preset Manager
 * Handles database operations for Zsiistant presets
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { presetSchema, createPresetSchema, updatePresetSchema, builtInPresets } from './preset-schema.js';

class PresetManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize the database and create tables if they don't exist
   */
  initialize() {
    return new Promise((resolve, reject) => {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening preset database:', err);
          reject(err);
          return;
        }
        
        console.log('Preset database connected');
        this.createTables()
          .then(() => this.loadBuiltInPresets())
          .then(() => {
            this.initialized = true;
            resolve();
          })
          .catch(reject);
      });
    });
  }

  /**
   * Create database tables for presets
   */
  createTables() {
    return new Promise((resolve, reject) => {
      const createPresetsTable = `
        CREATE TABLE IF NOT EXISTS presets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL,
          config_template TEXT NOT NULL, -- JSON
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          is_active BOOLEAN DEFAULT 1,
          preset_type TEXT DEFAULT 'template',
          tags TEXT DEFAULT '[]', -- JSON array
          requires TEXT, -- JSON
          author TEXT, -- JSON
          usage_instructions TEXT,
          examples TEXT, -- JSON
          migration_notes TEXT,
          version TEXT DEFAULT '1.0.0'
        )
      `;

      const createPresetUsageTable = `
        CREATE TABLE IF NOT EXISTS preset_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          preset_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          configuration TEXT NOT NULL, -- JSON of applied configuration
          FOREIGN KEY (preset_id) REFERENCES presets (id),
          FOREIGN KEY (agent_id) REFERENCES agents (id)
        )
      `;

      this.db.exec(`${createPresetsTable}; ${createPresetUsageTable}`, (err) => {
        if (err) {
          console.error('Error creating preset tables:', err);
          reject(err);
        } else {
          console.log('Preset tables created successfully');
          resolve();
        }
      });
    });
  }

  /**
   * Load built-in presets into the database
   */
  async loadBuiltInPresets() {
    try {
      // Check if built-in presets are already loaded
      const existingCount = await this.countPresets({ where: 'preset_type = "ready-to-use"' });
      
      if (existingCount === 0) {
        console.log('Loading built-in presets...');
        
        for (const [key, preset] of Object.entries(builtInPresets)) {
          const presetData = {
            ...preset,
            id: uuidv4(),
            preset_type: 'ready-to-use',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            version: '1.0.0',
            tags: JSON.stringify(preset.tags || []),
            config_template: JSON.stringify(preset.config_template)
          };

          await this.createPreset(presetData);
        }
        
        console.log('Built-in presets loaded successfully');
      }
    } catch (error) {
      console.error('Error loading built-in presets:', error);
    }
  }

  /**
   * Create a new preset
   */
  createPreset(presetData) {
    try {
      // Validate input data
      const validatedData = createPresetSchema.parse(presetData);
      
      const id = validatedData.id || uuidv4();
      const now = new Date().toISOString();
      
      const preset = {
        id,
        name: validatedData.name,
        description: validatedData.description,
        category: validatedData.category,
        config_template: JSON.stringify(validatedData.config_template),
        created_at: now,
        updated_at: now,
        is_active: validatedData.is_active ?? true,
        preset_type: validatedData.preset_type || 'template',
        tags: JSON.stringify(validatedData.tags || []),
        requires: validatedData.requires ? JSON.stringify(validatedData.requires) : null,
        author: validatedData.author ? JSON.stringify(validatedData.author) : null,
        usage_instructions: validatedData.usage_instructions || null,
        examples: validatedData.examples ? JSON.stringify(validatedData.examples) : null,
        migration_notes: validatedData.migration_notes || null,
        version: validatedData.version || '1.0.0'
      };

      return new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO presets (
            id, name, description, category, config_template, created_at, updated_at,
            is_active, preset_type, tags, requires, author, usage_instructions,
            examples, migration_notes, version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        this.db.run(sql, [
          preset.id, preset.name, preset.description, preset.category, preset.config_template,
          preset.created_at, preset.updated_at, preset.is_active, preset.preset_type,
          preset.tags, preset.requires, preset.author, preset.usage_instructions,
          preset.examples, preset.migration_notes, preset.version
        ], function(err) {
          if (err) {
            console.error('Error creating preset:', err);
            reject(err);
          } else {
            console.log(`Preset created with ID: ${preset.id}`);
            resolve({ id: preset.id, ...validatedData });
          }
        });
      });
    } catch (error) {
      console.error('Error validating preset data:', error);
      throw error;
    }
  }

  /**
   * Get a preset by ID
   */
  getPreset(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM presets WHERE id = ? AND is_active = 1';
      
      this.db.get(sql, [id], (err, row) => {
        if (err) {
          console.error('Error fetching preset:', err);
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(this.rowToPreset(row));
        }
      });
    });
  }

  /**
   * Get all presets, optionally filtered
   */
  getPresets(options = {}) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM presets WHERE is_active = 1';
      const params = [];

      // Apply filters
      if (options.category) {
        sql += ' AND category = ?';
        params.push(options.category);
      }

      if (options.preset_type) {
        sql += ' AND preset_type = ?';
        params.push(options.preset_type);
      }

      if (options.search) {
        sql += ' AND (name LIKE ? OR description LIKE ?)';
        const searchPattern = `%${options.search}%`;
        params.push(searchPattern, searchPattern);
      }

      // Apply sorting
      sql += ' ORDER BY created_at DESC';

      // Apply pagination
      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
        
        if (options.offset) {
          sql += ' OFFSET ?';
          params.push(options.offset);
        }
      }

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          console.error('Error fetching presets:', err);
          reject(err);
        } else {
          const presets = rows.map(row => this.rowToPreset(row));
          resolve(presets);
        }
      });
    });
  }

  /**
   * Update a preset
   */
  updatePreset(id, updateData) {
    try {
      // Get existing preset first
      return this.getPreset(id).then(existingPreset => {
        if (!existingPreset) {
          throw new Error('Preset not found');
        }

        // Validate update data
        const validatedData = updatePresetSchema.parse({
          ...existingPreset,
          ...updateData
        });

        const now = new Date().toISOString();
        
        const updates = [];
        const params = [];

        // Build dynamic update query
        const updatableFields = [
          'name', 'description', 'category', 'config_template', 'preset_type',
          'tags', 'requires', 'author', 'usage_instructions', 'examples', 
          'migration_notes', 'version', 'is_active'
        ];

        for (const field of updatableFields) {
          if (validatedData[field] !== undefined) {
            updates.push(`${field} = ?`);
            
            if (field === 'config_template' || field === 'tags' || field === 'requires' || 
                field === 'author' || field === 'examples') {
              params.push(JSON.stringify(validatedData[field]));
            } else {
              params.push(validatedData[field]);
            }
          }
        }

        updates.push('updated_at = ?');
        params.push(now);
        params.push(id);

        const sql = `UPDATE presets SET ${updates.join(', ')} WHERE id = ?`;

        return new Promise((resolve, reject) => {
          this.db.run(sql, params, function(err) {
            if (err) {
              console.error('Error updating preset:', err);
              reject(err);
            } else {
              console.log(`Preset updated with ID: ${id}`);
              resolve({ id, ...validatedData });
            }
          });
        });
      });
    } catch (error) {
      console.error('Error updating preset:', error);
      throw error;
    }
  }

  /**
   * Delete a preset (soft delete)
   */
  deletePreset(id) {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE presets SET is_active = 0 WHERE id = ?';
      
      this.db.run(sql, [id], function(err) {
        if (err) {
          console.error('Error deleting preset:', err);
          reject(err);
        } else {
          console.log(`Preset deleted with ID: ${id}`);
          resolve({ id, deleted: true });
        }
      });
    });
  }

  /**
   * Count presets with optional filters
   */
  countPresets(options = {}) {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT COUNT(*) as count FROM presets WHERE is_active = 1';
      const params = [];

      if (options.category) {
        sql += ' AND category = ?';
        params.push(options.category);
      }

      if (options.preset_type) {
        sql += ' AND preset_type = ?';
        params.push(options.preset_type);
      }

      if (options.search) {
        sql += ' AND (name LIKE ? OR description LIKE ?)';
        const searchPattern = `%${options.search}%`;
        params.push(searchPattern, searchPattern);
      }

      this.db.get(sql, params, (err, row) => {
        if (err) {
          console.error('Error counting presets:', err);
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    });
  }

  /**
   * Apply a preset configuration to create agents and settings
   */
  applyPreset(presetId, userId) {
    try {
      return this.getPreset(presetId).then(preset => {
        if (!preset) {
          throw new Error('Preset not found');
        }

        // Parse config template
        const configTemplate = typeof preset.config_template === 'string' 
          ? JSON.parse(preset.config_template) 
          : preset.config_template;

        // Here you would integrate with the existing agent system
        // For now, return the configuration that needs to be applied
        return {
          preset_id: presetId,
          user_id: userId,
          config_template: configTemplate,
          applied_at: new Date().toISOString()
        };
      });
    } catch (error) {
      console.error('Error applying preset:', error);
      throw error;
    }
  }

  /**
   * Convert database row to preset object
   */
  rowToPreset(row) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      config_template: typeof row.config_template === 'string' 
        ? JSON.parse(row.config_template) 
        : row.config_template,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_active: Boolean(row.is_active),
      preset_type: row.preset_type,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags || [],
      requires: row.requires ? JSON.parse(row.requires) : undefined,
      author: row.author ? JSON.parse(row.author) : undefined,
      usage_instructions: row.usage_instructions,
      examples: row.examples ? JSON.parse(row.examples) : undefined,
      migration_notes: row.migration_notes,
      version: row.version
    };
  }

  /**
   * Close database connection
   */
  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing preset database:', err);
            reject(err);
          } else {
            console.log('Preset database connection closed');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

export default PresetManager;