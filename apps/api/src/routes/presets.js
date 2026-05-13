/**
 * Preset Routes - Handle all preset-related API endpoints
 */

import { readRequestBody } from '../shared/read.js';
import { v4 as uuidv4 } from 'uuid';

export function registerPresetRoutes(server, registry) {
  /**
   * Handle preset CRUD operations
   */
  const handlePresets = async (request, response) => {
    // GET /api/presets - List all presets
    if (request.method === "GET" && request.url?.startsWith("/api/presets")) {
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

    // POST /api/presets - Create new preset
    if (request.method === "POST" && request.url?.startsWith("/api/presets")) {
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
          id: uuidv4(),
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
    if (request.method === "PATCH" && request.url?.startsWith("/api/presets")) {
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
    if (request.method === "DELETE" && request.url?.startsWith("/api/presets")) {
      try {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const id = url.searchParams.get('id');
        
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

    return false; // Not handled by this route
  };

  // Register preset routes
  server.onRequest?.(handlePresets);
  
  // Legacy support
  if (typeof server === 'function') {
    server('all', '/api/presets', handlePresets);
  }
}