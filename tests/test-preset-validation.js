/**
 * Test preset schema validation
 */

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

// Read the preset schema
const presetSchemaPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'preset-schema.js');
const presetSchemaModule = await import(presetSchemaPath);
const { presetSchema } = presetSchemaModule;

// Test data for validation
const testPresets = [
  {
    name: 'Home Assistant',
    description: 'Smart home automation assistant with device control and monitoring capabilities',
    configTemplate: {
      systemPrompt: 'You are a Home Assistant automation expert.',
      defaultModel: 'qwen3:1.7b',
      tools: ['device_control', 'scene_manager']
    },
    category: 'smart_home',
    isSystem: true,
    isFeatured: true,
    tags: ['home', 'automation', 'iot']
  },
  {
    name: 'Productivity Pro',
    description: 'Comprehensive productivity suite for task management and scheduling',
    configTemplate: {
      systemPrompt: 'You are a productivity expert.',
      defaultModel: 'qwen3:1.7b',
      tools: ['task_manager', 'scheduler']
    },
    category: 'productivity',
    isSystem: false,
    isFeatured: true,
    tags: ['productivity', 'task-management']
  }
];

console.log('🧪 Testing preset schema validation...\n');

// Test each preset
testPresets.forEach((preset, index) => {
  try {
    console.log(`Test ${index + 1}: Validating preset "${preset.name}"`);
    
    // Validate the preset using the schema
    const validatedPreset = presetSchema.parse(preset);
    
    console.log('✅ Validation passed');
    console.log(`   Name: ${validatedPreset.name}`);
    console.log(`   Description: ${validatedPreset.description}`);
    console.log(`   Category: ${validatedPreset.category}`);
    console.log(`   Is System: ${validatedPreset.isSystem}`);
    console.log(`   Is Featured: ${validatedPreset.isFeatured}`);
    console.log(`   Tags: ${validatedPreset.tags.join(', ')}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    console.error('Errors:', error.errors.map(e => e.message).join(', '));
    console.log('');
  }
});

// Test invalid data
console.log('🧪 Testing invalid data...\n');

const invalidPresets = [
  {
    name: '', // Empty name
    description: 'Too short',
    configTemplate: {}
  },
  {
    name: 'Valid Name',
    description: 'Valid description',
    // Missing configTemplate
  },
  {
    name: 'Valid Name',
    description: 'Valid description',
    configTemplate: 'not an object' // Invalid configTemplate type
  }
];

invalidPresets.forEach((preset, index) => {
  try {
    console.log(`Invalid Test ${index + 1}: Testing invalid preset`);
    const validatedPreset = presetSchema.parse(preset);
    console.log('❌ Expected validation to fail but it passed');
  } catch (error) {
    console.log('✅ Validation correctly failed');
    console.log('   Errors:', error.errors.map(e => e.message).join(', '));
  }
  console.log('');
});

console.log('🎉 Schema validation testing completed!');