import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const databasePath = './data/zsiistant.sqlite';
console.log('Database path:', databasePath);

const db = new DatabaseSync(databasePath);

try {
  // Check if presets table exists
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='presets'").all();
  console.log('Presets table exists:', tables.length > 0);
  
  if (tables.length > 0) {
    // Get table schema
    const schema = db.prepare("PRAGMA table_info(presets)").all();
    console.log('Presets table schema:');
    schema.forEach(column => {
      console.log(`  ${column.name}: ${column.type} (${column.dflt_value || 'NULL'})`);
    });
    
    // Check existing presets
    const presets = db.prepare("SELECT COUNT(*) as count FROM presets").get();
    console.log('Existing presets count:', presets.count);
  }
  
  // Check what other tables exist
  const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('All tables:', allTables.map(t => t.name));
  
} catch (error) {
  console.error('Error:', error.message);
} finally {
  db.close();
}