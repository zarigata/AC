import { DatabaseSync } from 'node:sqlite';

async function checkContainerDatabase() {
  console.log('=== CHECKING CONTAINER DATABASE ===');
  
  // Check different database paths
  const databasePaths = [
    '/app/data/zsiistant.sqlite',
    './data/zsiistant.sqlite',
    new URL('./data/zsiistant.sqlite', import.meta.url).pathname
  ];
  
  for (const path of databasePaths) {
    console.log(`\nChecking database path: ${path}`);
    
    try {
      const db = new DatabaseSync(path);
      
      // Check if file exists
      const fs = await import('fs');
      if (fs.existsSync(path)) {
        console.log('✅ File exists');
        
        // Check tables
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log('Tables in database:', tables.map(t => t.name));
        
        // Check if presets table exists
        const presetsTable = tables.find(t => t.name === 'presets');
        if (presetsTable) {
          console.log('✅ Presets table exists');
          
          // Check data in presets table
          const presets = db.prepare("SELECT * FROM presets").all();
          console.log(`✅ Found ${presets.length} presets`);
          
          if (presets.length > 0) {
            console.log('Sample preset:', presets[0]);
          }
          
        } else {
          console.log('❌ Presets table does not exist');
          
          // Check if we can create the table
          try {
            db.prepare(`
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
                enabled INTEGER NOT NOT NULL DEFAULT 1,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
              )
            `).run();
            
            console.log('✅ Created presets table');
            
            // Check if table was created
            const newTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            const newPresetsTable = newTables.find(t => t.name === 'presets');
            if (newPresetsTable) {
              console.log('✅ Presets table created successfully');
            }
            
          } catch (error) {
            console.log('❌ Error creating presets table:', error.message);
          }
        }
        
        db.close();
        
      } else {
        console.log('❌ File does not exist');
      }
      
    } catch (error) {
      console.log(`❌ Error with path ${path}:`, error.message);
    }
  }
  
  console.log('\n=== DATABASE CHECK COMPLETE ===');
}

checkContainerDatabase().catch(console.error);