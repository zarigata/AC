import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'fs';

async function createPresetsTable() {
  console.log('=== CREATING PRESETS TABLE ===');
  
  const databasePaths = [
    '/app/data/zsiistant.sqlite',
    './data/zsiistant.sqlite'
  ];
  
  for (const path of databasePaths) {
    console.log(`\nCreating presets table in: ${path}`);
    
    try {
      const db = new DatabaseSync(path);
      
      // Read the SQL schema
      const sql = `
        CREATE TABLE IF NOT EXISTS presets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL,
          configTemplate TEXT NOT NULL,
          icon TEXT,
          category TEXT,
          isSystem INTEGER NOT NULL DEFAULT 0,
          isFeatured INTEGER NOT NULL DEFAULT 0,
          orderIndex INTEGER NOT NULL DEFAULT 0,
          tags TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_presets_name ON presets(name);
        CREATE INDEX IF NOT EXISTS idx_presets_category ON presets(category);
        CREATE INDEX IF NOT EXISTS idx_presets_enabled ON presets(enabled);
        CREATE INDEX IF NOT EXISTS idx_presets_system ON presets(isSystem);
        CREATE INDEX IF NOT EXISTS idx_presets_featured ON presets(isFeatured);
        CREATE INDEX IF NOT EXISTS idx_presets_order ON presets(orderIndex);
      `;
      
      // Execute the SQL
      db.exec(sql);
      console.log('✅ Presets table created successfully');
      
      // Verify the table was created
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='presets'").all();
      if (tables.length > 0) {
        console.log('✅ Presets table verified');
        
        // Insert some sample data
        const samplePresets = [
          {
            id: 'home-assistant',
            name: 'Home Assistant',
            description: 'Smart home automation assistant with device management',
            configTemplate: {
              systemPrompt: 'You are a Home Assistant automation expert. Help users with smart home setup, automation rules, and device management.',
              tools: ['web_search', 'exec'],
              model: 'qwen3:1.7b',
              provider: 'ollama'
            },
            icon: '🏠',
            category: 'smart-home',
            isSystem: true,
            isFeatured: true,
            orderIndex: 1,
            tags: ['smart-home', 'automation', 'iot'],
            enabled: true
          },
          {
            id: 'productivity-pro',
            name: 'Productivity Pro',
            description: 'Personal productivity assistant for task management and organization',
            configTemplate: {
              systemPrompt: 'You are a productivity expert. Help users with task management, goal setting, and personal organization.',
              tools: ['read', 'write', 'exec'],
              model: 'qwen3:1.7b',
              provider: 'ollama'
            },
            icon: '📋',
            category: 'productivity',
            isSystem: true,
            isFeatured: true,
            orderIndex: 2,
            tags: ['productivity', 'tasks', 'organization'],
            enabled: true
          }
        ];
        
        for (const preset of samplePresets) {
          try {
            db.prepare(`
              INSERT OR REPLACE INTO presets (
                id, name, description, configTemplate, icon, category,
                isSystem, isFeatured, orderIndex, tags, enabled, createdAt, updatedAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              preset.id,
              preset.name,
              preset.description,
              JSON.stringify(preset.configTemplate),
              preset.icon,
              preset.category,
              preset.isSystem ? 1 : 0,
              preset.isFeatured ? 1 : 0,
              preset.orderIndex,
              JSON.stringify(preset.tags),
              preset.enabled ? 1 : 0,
              new Date().toISOString(),
              new Date().toISOString()
            );
            console.log(`✅ Inserted preset: ${preset.name}`);
          } catch (error) {
            console.log(`❌ Error inserting preset ${preset.name}:`, error.message);
          }
        }
        
        const presets = db.prepare("SELECT COUNT(*) as count FROM presets").get();
        console.log(`📊 Total presets: ${presets.count}`);
        
      } else {
        console.log('❌ Presets table not found after creation');
      }
      
      db.close();
      
    } catch (error) {
      console.log(`❌ Error with path ${path}:`, error.message);
    }
  }
  
  console.log('\n=== PRESETS TABLE CREATION COMPLETE ===');
}

createPresetsTable().catch(console.error);