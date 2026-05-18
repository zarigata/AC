import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';

async function checkAndFixSchema() {
  const dbPath = '/app/data/zsiistant.sqlite';
  
  try {
    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
      console.log('Database file does not exist');
      return;
    }
    
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    // Check if agents table exists
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'");
    
    if (tables.length === 0) {
      console.log('Agents table does not exist, creating it...');
      // Create the table with full schema
      await db.exec(`
        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          purpose TEXT NOT NULL,
          systemPrompt TEXT DEFAULT NULL,
          status TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          isolationMode TEXT NOT NULL,
          maxConcurrentTasks INTEGER NOT NULL DEFAULT 1,
          peerAccess INTEGER NOT NULL DEFAULT 0,
          toolsConfig TEXT DEFAULT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        )
      `);
    } else {
      // Check if systemPrompt column exists
      const columns = await db.all("PRAGMA table_info(agents)");
      const systemPromptColumn = columns.find(col => col.name === 'systemPrompt');
      
      if (!systemPromptColumn) {
        console.log('systemPrompt column does not exist, adding it...');
        await db.exec('ALTER TABLE agents ADD COLUMN systemPrompt TEXT DEFAULT NULL');
      }
    }
    
    console.log('Database schema is up to date');
    await db.close();
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAndFixSchema();