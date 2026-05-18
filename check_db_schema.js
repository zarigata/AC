#!/usr/bin/env node

// Simple script to check database schema
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

async function checkSchema() {
  try {
    const db = await open({
      filename: '/app/data/zsiistant.sqlite',
      driver: sqlite3.Database
    });
    
    console.log('Database file exists');
    
    // Check if agents table exists
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'");
    console.log('Agents table exists:', tables.length > 0);
    
    if (tables.length > 0) {
      const columns = await db.all("PRAGMA table_info(agents)");
      console.log('Agents table columns:');
      columns.forEach(col => {
        console.log(`  ${col.name} (${col.type}) ${col.dflt_value ? 'DEFAULT: ' + col.dflt_value : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
      });
    }
    
    await db.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkSchema();