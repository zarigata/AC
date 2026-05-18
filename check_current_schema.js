import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

async function checkCurrentSchema() {
  try {
    const db = await open({
      filename: '/app/data/zsiistant.sqlite',
      driver: sqlite3.Database
    });
    
    console.log('=== Database Schema Check ===');
    
    // Check if agents table exists
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'");
    console.log('Agents table exists:', tables.length > 0);
    
    if (tables.length > 0) {
      const columns = await db.all("PRAGMA table_info(agents)");
      console.log('Agents table columns:');
      columns.forEach(col => {
        console.log(`  ${col.name} (${col.type}) ${col.dflt_value ? 'DEFAULT: ' + col.dflt_value : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
      });
      
      // Try to insert test data to see what happens
      console.log('\n=== Testing Insert ===');
      try {
        await db.run(`
          INSERT INTO agents (id, name, purpose, status, provider, model, isolationMode, maxConcurrentTasks, peerAccess, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'test-id',
          'Test Agent',
          'test purpose',
          'idle',
          'ollama',
          'qwen3:1.7b',
          'default',
          1,
          0,
          new Date().toISOString(),
          new Date().toISOString()
        ]);
        console.log('✅ Insert successful');
      } catch (insertError) {
        console.log('❌ Insert failed:', insertError.message);
      }
    }
    
    await db.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkCurrentSchema();