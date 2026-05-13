import fs from 'fs';
import path from 'path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

// Read the SQL schema file
const schemaPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'create_presets.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

console.log('Applying preset schema...');

// Read the current database
const dbPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'data', 'zsiistant.sqlite');

async function applySchema() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  try {
    // Execute the schema
    await db.exec(schema);
    console.log('✅ Preset schema applied successfully');
    
    // Verify the table was created
    const result = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='presets'");
    console.log(`📊 Found ${result.length} preset tables`);
    
    if (result.length > 0) {
      const columns = await db.all("PRAGMA table_info(presets)");
      console.log('📋 Preset table columns:', columns.map(col => col.name));
    }
    
    await db.close();
  } catch (error) {
    console.error('❌ Error applying schema:', error.message);
    await db.close();
    process.exit(1);
  }
}

applySchema();