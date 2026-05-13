/**
 * Presets API Routes
 * Handle CRUD operations for Zsiistant presets
 */

import express from 'express';
import { presetSchema, updatePresetSchema } from './preset-schema.js';
import PresetManager from './presetManager.js';

const router = express.Router();

// Initialize preset manager
let presetManager;

/**
 * Initialize preset manager with database path
 */
function initializePresetManager(dbPath) {
  if (!presetManager) {
    presetManager = new PresetManager(dbPath);
  }
  return presetManager;
}

/**
 * GET /api/presets - List all presets
 */
router.get('/', async (req, res) => {
  try {
    const options = {
      category: req.query.category,
      preset_type: req.query.type,
      search: req.query.search,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    };

    const presets = await presetManager.getPresets(options);
    const total = await presetManager.countPresets(options);

    res.json({
      success: true,
      data: presets,
      pagination: {
        total,
        limit: options.limit,
        offset: options.offset,
        has_more: options.offset + options.limit < total
      }
    });
  } catch (error) {
    console.error('Error fetching presets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch presets',
      details: error.message
    });
  }
});

/**
 * GET /api/presets/:id - Get a specific preset
 */
router.get('/:id', async (req, res) => {
  try {
    const preset = await presetManager.getPreset(req.params.id);
    
    if (!preset) {
      return res.status(404).json({
        success: false,
        error: 'Preset not found'
      });
    }

    res.json({
      success: true,
      data: preset
    });
  } catch (error) {
    console.error('Error fetching preset:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preset',
      details: error.message
    });
  }
});

/**
 * POST /api/presets - Create a new preset
 */
router.post('/', async (req, res) => {
  try {
    // Validate request body
    const validatedData = presetSchema.parse(req.body);
    
    const preset = await presetManager.createPreset(validatedData);
    
    res.status(201).json({
      success: true,
      data: preset,
      message: 'Preset created successfully'
    });
  } catch (error) {
    console.error('Error creating preset:', error);
    
    if (error.name === 'ZodError') {
      res.status(400).json({
        success: false,
        error: 'Invalid preset data',
        details: error.errors
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to create preset',
        details: error.message
      });
    }
  }
});

/**
 * PUT /api/presets/:id - Update a preset
 */
router.put('/:id', async (req, res) => {
  try {
    const preset = await presetManager.getPreset(req.params.id);
    
    if (!preset) {
      return res.status(404).json({
        success: false,
        error: 'Preset not found'
      });
    }

    // Validate update data
    const validatedData = updatePresetSchema.parse({
      ...preset,
      ...req.body
    });
    
    const updatedPreset = await presetManager.updatePreset(req.params.id, validatedData);
    
    res.json({
      success: true,
      data: updatedPreset,
      message: 'Preset updated successfully'
    });
  } catch (error) {
    console.error('Error updating preset:', error);
    
    if (error.name === 'ZodError') {
      res.status(400).json({
        success: false,
        error: 'Invalid preset data',
        details: error.errors
      });
    } else if (error.message === 'Preset not found') {
      res.status(404).json({
        success: false,
        error: 'Preset not found'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update preset',
        details: error.message
      });
    }
  }
});

/**
 * PATCH /api/presets/:id - Partially update a preset
 */
router.patch('/:id', async (req, res) => {
  try {
    const preset = await presetManager.getPreset(req.params.id);
    
    if (!preset) {
      return res.status(404).json({
        success: false,
        error: 'Preset not found'
      });
    }

    // Validate update data (partial)
    const validatedData = updatePresetSchema.partial().parse(req.body);
    
    const updatedPreset = await presetManager.updatePreset(req.params.id, validatedData);
    
    res.json({
      success: true,
      data: updatedPreset,
      message: 'Preset updated successfully'
    });
  } catch (error) {
    console.error('Error updating preset:', error);
    
    if (error.name === 'ZodError') {
      res.status(400).json({
        success: false,
        error: 'Invalid preset data',
        details: error.errors
      });
    } else if (error.message === 'Preset not found') {
      res.status(404).json({
        success: false,
        error: 'Preset not found'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update preset',
        details: error.message
      });
    }
  }
});

/**
 * DELETE /api/presets/:id - Delete a preset (soft delete)
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await presetManager.deletePreset(req.params.id);
    
    res.json({
      success: true,
      data: result,
      message: 'Preset deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting preset:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete preset',
      details: error.message
    });
  }
});

/**
 * POST /api/presets/:id/apply - Apply a preset configuration
 */
router.post('/:id/apply', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id is required'
      });
    }

    const result = await presetManager.applyPreset(req.params.id, user_id);
    
    res.json({
      success: true,
      data: result,
      message: 'Preset applied successfully'
    });
  } catch (error) {
    console.error('Error applying preset:', error);
    
    if (error.message === 'Preset not found') {
      res.status(404).json({
        success: false,
        error: 'Preset not found'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to apply preset',
        details: error.message
      });
    }
  }
});

/**
 * GET /api/presets/categories - Get all available categories
 */
router.get('/categories/list', async (req, res) => {
  try {
    const categories = [
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
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
      details: error.message
    });
  }
});

/**
 * GET /api/presets/types - Get all available preset types
 */
router.get('/types/list', async (req, res) => {
  try {
    const types = ['template', 'ready-to-use', 'preset'];
    
    res.json({
      success: true,
      data: types
    });
  } catch (error) {
    console.error('Error fetching preset types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preset types',
      details: error.message
    });
  }
});

/**
 * GET /api/presets/search - Search presets with advanced filtering
 */
router.get('/search', async (req, res) => {
  try {
    const { q, category, type, tags, limit = 20, offset = 0 } = req.query;
    
    const options = {
      search: q,
      category: category || undefined,
      preset_type: type || undefined,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
    
    // Filter by tags if provided
    let presets = await presetManager.getPresets(options);
    
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      presets = presets.filter(preset => 
        preset.tags.some(tag => tagArray.includes(tag))
      );
    }
    
    const total = presets.length;
    
    res.json({
      success: true,
      data: presets,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: parseInt(offset) + parseInt(limit) < total
      }
    });
  } catch (error) {
    console.error('Error searching presets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search presets',
      details: error.message
    });
  }
});

export { router as registerPresetRoutes, initializePresetManager };