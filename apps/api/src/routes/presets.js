/**
 * Preset Routes - Handle all preset-related API endpoints
 */

import { readRequestBody } from '../shared/read.js';

export function registerPresetRoutes(server, registry) {
  /**
   * Handle preset CRUD operations
   */
  const handlePresets = async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    
    // GET /api/presets - List all presets
    if (request.method === "GET" && url.pathname === "/api/presets") {
      try {
        const presets = await registry.getAllPresets();
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ presets }));
        return true;
      } catch (error) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Failed to fetch presets" }));
        return true;
      }
    }

    // GET /api/presets/:id - Get individual preset
    const presetMatch = url.pathname.match(/^\/api\/presets\/([\w-]+)$/);
    if (request.method === "GET" && presetMatch) {
      try {
        const id = presetMatch[1];
        
        const preset = await registry.getPresetById(id);
        if (!preset) {
          response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset not found" }));
          return true;
        }
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ preset }));
        return true;
      } catch (error) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Failed to fetch preset" }));
        return true;
      }
    }

    // POST /api/presets - Create new preset
    if (request.method === "POST" && url.pathname === "/api/presets") {
      try {
        const body = await readRequestBody(request);
        
        // Validate input
        if (!body || typeof body !== 'object') {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset payload must be an object" }));
          return true;
        }
        
        if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset name is required" }));
          return true;
        }
        
        if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset description is required" }));
          return true;
        }
        
        if (!body.configTemplate || typeof body.configTemplate !== 'object') {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset configTemplate is required and must be an object" }));
          return true;
        }
        
        const preset = {
          id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: body.name.trim(),
          description: body.description.trim(),
          configTemplate: body.configTemplate,
          icon: body.icon || null,
          category: body.category || 'general',
          isSystem: body.isSystem || false,
          isFeatured: body.isFeatured || false,
          orderIndex: body.orderIndex || 0,
          tags: body.tags || [],
          enabled: body.enabled !== undefined ? body.enabled : true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        await registry.createPreset(preset);
        response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ preset }));
        return true;
      } catch (error) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Failed to create preset" }));
        return true;
      }
    }

    // PATCH /api/presets - Update existing preset
    if (request.method === "PATCH" && url.pathname === "/api/presets") {
      try {
        const body = await readRequestBody(request);
        
        // Validate input
        if (!body || typeof body !== 'object' || !body.id) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset payload must be an object with id" }));
          return true;
        }
        
        const existingPreset = await registry.getPresetById(body.id);
        if (!existingPreset) {
          response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset not found" }));
          return true;
        }
        
        // Create updated preset
        const updates = {};
        const allowedFields = ['name', 'description', 'configTemplate', 'icon', 'category', 'isSystem', 'isFeatured', 'orderIndex', 'tags', 'enabled'];
        
        for (const field of allowedFields) {
          if (body[field] !== undefined) {
            updates[field] = body[field];
          }
        }
        
        updates.updatedAt = new Date().toISOString();
        
        await registry.updatePreset(body.id, updates);
        const updatedPreset = await registry.getPresetById(body.id);
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ preset: updatedPreset }));
        return true;
      } catch (error) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Failed to update preset" }));
        return true;
      }
    }

    // DELETE /api/presets - Delete preset
    if (request.method === "DELETE" && url.pathname === "/api/presets") {
      try {
        const urlObj = new URL(request.url, `http://${request.headers.host}`);
        const id = urlObj.searchParams.get('id');
        
        if (!id) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset ID is required" }));
          return true;
        }
        
        const existingPreset = await registry.getPresetById(id);
        if (!existingPreset) {
          response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset not found" }));
          return true;
        }
        
        await registry.deletePreset(id);
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ success: true }));
        return true;
      } catch (error) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Failed to delete preset" }));
        return true;
      }
    }

    // POST /api/presets/:id/apply - Apply a preset
    const applyMatch = url.pathname.match(/^\/api\/presets\/([\w-]+)\/apply$/);
    if (request.method === "POST" && applyMatch) {
      try {
        const id = applyMatch[1];
        
        if (!id) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset ID is required" }));
          return true;
        }
        
        const preset = await registry.getPresetById(id);
        if (!preset) {
          response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset not found" }));
          return true;
        }
        
        if (!preset.enabled) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset is disabled and cannot be applied" }));
          return true;
        }
        
        const body = await readRequestBody(request);
        const targetId = body.targetId || body.agentId;
        
        if (!targetId) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Target ID (agentId or targetId) is required" }));
          return true;
        }
        
        // Apply preset configuration to target (agent or system)
        const result = await registry.applyPreset(id, targetId, body.customizations || {});
        
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ 
          success: true, 
          message: `Preset '${preset.name}' applied successfully`,
          result 
        }));
        return true;
      } catch (error) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Failed to apply preset" }));
        return true;
      }
    }

    // POST /api/presets/:id/customize - Customize a preset
    const customizeMatch = url.pathname.match(/^\/api\/presets\/([\w-]+)\/customize$/);
    if (request.method === "POST" && customizeMatch) {
      try {
        const id = customizeMatch[1];
        
        if (!id) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset ID is required" }));
          return true;
        }
        
        const preset = await registry.getPresetById(id);
        if (!preset) {
          response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify({ error: "Preset not found" }));
          return true;
        }
        
        const body = await readRequestBody(request);
        const customizations = body.customizations || {};
        const customizationName = body.name || `Customization of ${preset.name}`;
        const customizationDescription = body.description || `Custom version of ${preset.description}`;
        
        // Create customized preset based on the original
        const customizedPreset = {
          ...preset,
          id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: customizationName,
          description: customizationDescription,
          originalPresetId: id,
          isSystem: false, // Custom presets are not system presets
          isCustomization: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Apply customizations to configTemplate
        if (customizations.configTemplate) {
          customizedPreset.configTemplate = {
            ...preset.configTemplate,
            ...customizations.configTemplate
          };
        }
        
        // Apply other customizations
        if (customizations.icon) customizedPreset.icon = customizations.icon;
        if (customizations.category) customizedPreset.category = customizations.category;
        if (customizations.tags) customizedPreset.tags = [...(preset.tags || []), ...(customizations.tags || [])];
        
        await registry.createPreset(customizedPreset);
        
        response.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ 
          success: true, 
          customizedPreset,
          message: `Custom preset '${customizationName}' created successfully`
        }));
        return true;
      } catch (error) {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Failed to customize preset" }));
        return true;
      }
    }

    return false; // Not handled by this route
  };

  // Register preset routes
  server.on('request', handlePresets);
  
  // Legacy support
  if (typeof server === 'function') {
    server('all', '/api/presets', handlePresets);
  }
}