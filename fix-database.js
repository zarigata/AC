#!/usr/bin/env node

/**
 * Database Schema Fix Script
 * 
 * This script fixes database schema issues by adding missing columns
 * and ensuring the table structure matches the expected schema.
 */

import pkg from 'sqlite3';
const { Database } = pkg;
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Fix database path for container environment
const databasePath = process.env.ZSIISTANT_DB_PATH || 
  "/app/data/zsiistant.sqlite";

console.log('🔧 Starting database schema fix...');
console.log('📁 Database path:', databasePath);

// Create database connection
const db = new Database(databasePath);

// Function to check and add missing columns
function addMissingColumn(tableName, columnName, columnDefinition) {
  return new Promise((resolve, reject) => {
    console.log(`🔍 Checking column ${columnName} in table ${tableName}...`);
    
    // Check if column exists
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
      if (err) {
        reject(err);
        return;
      }
      
      const columnExists = columns.some(col => col.name === columnName);
      
      if (columnExists) {
        console.log(`✅ Column ${columnName} already exists`);
        resolve();
      } else {
        console.log(`⚠️ Column ${columnName} missing, adding...`);
        db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`, (err) => {
          if (err) {
            console.error(`❌ Failed to add column ${columnName}:`, err.message);
            reject(err);
          } else {
            console.log(`✅ Successfully added column ${columnName}`);
            resolve();
          }
        });
      }
    });
  });
}

// Main fix function
async function fixDatabase() {
  try {
    // Check if agents table exists
    db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name='agents'`, (err, tables) => {
      if (err) {
        throw err;
      }
      
      if (tables.length === 0) {
        console.log('❌ Agents table does not exist');
        process.exit(1);
      }
      
      console.log('✅ Agents table exists');
      
      // Add missing columns if they don't exist
      const columnsToAdd = [
        { name: 'systemPrompt', definition: 'TEXT DEFAULT NULL' },
        { name: 'toolsConfig', definition: 'TEXT DEFAULT NULL' },
        { name: 'isolationMode', definition: 'TEXT NOT NULL DEFAULT "isolated"' },
        { name: 'maxConcurrentTasks', definition: 'INTEGER NOT NULL DEFAULT 4' },
        { name: 'peerAccess', definition: 'INTEGER NOT NULL DEFAULT 0' }
      ];
      
      let fixCount = 0;
      
      columnsToAdd.forEach(({ name, definition }) => {
        addMissingColumn('agents', name, definition)
          .then(() => fixCount++)
          .catch(err => {
            console.error(`❌ Error fixing column ${name}:`, err.message);
          });
      });
      
      // Close database after a short delay to let all operations complete
      setTimeout(() => {
        console.log(`🎉 Database fix completed. ${fixCount} columns added/verified`);
        db.close();
        process.exit(0);
      }, 2000);
    });
    
  } catch (err) {
    console.error('❌ Database fix failed:', err.message);
    db.close();
    process.exit(1);
  }
}

// Run the fix
fixDatabase();