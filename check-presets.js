import fs from 'fs';
import path from 'path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

// Read the current database
const dbPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'data', 'zsiistant.sqlite');

async function checkPresets() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  try {
    // Check if presets table exists and count records
    const result = await db.all("SELECT COUNT(*) as count FROM presets");
    console.log(`📊 Total presets: ${result[0].count}`);
    
    // Get all presets
    const presets = await db.all("SELECT id, name, description, category, isSystem, isFeatured FROM presets ORDER BY orderIndex");
    
    if (presets.length > 0) {
      console.log('📋 Presets:');
      presets.forEach((preset, index) => {
        console.log(`${index + 1}. ${preset.name} (${preset.category}) - ${preset.isSystem ? 'System' : 'User'} preset`);
        console.log(`   ID: ${preset.id}`);
        console.log(`   Description: ${preset.description.substring(0, 100)}...`);
        console.log(`   Featured: ${preset.isFeatured ? 'Yes' : 'No'}`);
        console.log('');
      });
    } else {
      console.log('📭 No presets found in database');
    }
    
    await db.close();
  } catch (error) {
    console.error('❌ Error checking presets:', error.message);
    await db.close();
    process.exit(1);
  }
}

checkPresets();