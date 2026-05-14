/**
 * Test script for Preset API endpoints
 */

import { exec } from 'child_process';

async function testPresetAPI() {
  console.log('🧪 Testing Preset API endpoints...\n');

  // Test 1: Create a preset
  console.log('📝 Test 1: Creating a preset...');
  const createPreset = {
    method: 'POST',
    url: 'http://localhost:4000/api/presets',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Home Assistant',
      description: 'Smart home automation assistant with device control and monitoring capabilities',
      configTemplate: {
        systemPrompt: 'You are a Home Assistant automation expert. Help users configure smart home devices, create automations, and monitor home security.',
        defaultModel: 'qwen3:1.7b',
        tools: ['device_control', 'automation_builder', 'scene_manager'],
        categories: ['smart_home', 'automation', 'security']
      },
      icon: '🏠',
      category: 'smart_home',
      isSystem: true,
      isFeatured: true,
      orderIndex: 1,
      tags: ['home', 'automation', 'iot']
    })
  };

  try {
    const result = await executeCommand(`curl -X POST -H "Content-Type: application/json" -d '${createPreset.body}' http://localhost:4000/api/presets`);
    console.log('✅ Create preset response:', result);
  } catch (error) {
    console.error('❌ Create preset failed:', error.message);
    return;
  }

  // Test 2: List all presets
  console.log('\n📋 Test 2: Listing all presets...');
  try {
    const result = await executeCommand('curl http://localhost:4000/api/presets');
    console.log('✅ List presets response:', result);
  } catch (error) {
    console.error('❌ List presets failed:', error.message);
    return;
  }

  // Test 3: Update a preset
  console.log('\n🔄 Test 3: Updating a preset...');
  const updatePreset = {
    method: 'PATCH',
    url: 'http://localhost:4000/api/presets',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: '1', // This should be replaced with actual ID from create response
      description: 'Updated smart home automation assistant with advanced device control and monitoring capabilities',
      isFeatured: false
    })
  };

  try {
    const result = await executeCommand(`curl -X PATCH -H "Content-Type: application/json" -d '${updatePreset.body}' http://localhost:4000/api/presets`);
    console.log('✅ Update preset response:', result);
  } catch (error) {
    console.error('❌ Update preset failed:', error.message);
    return;
  }

  // Test 4: Delete a preset
  console.log('\n🗑️ Test 4: Deleting a preset...');
  try {
    const result = await executeCommand('curl -X DELETE http://localhost:4000/api/presets?id=1');
    console.log('✅ Delete preset response:', result);
  } catch (error) {
    console.error('❌ Delete preset failed:', error.message);
    return;
  }

  console.log('\n🎉 All preset API tests completed!');
}

function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command failed: ${error.message}`));
      } else if (stderr) {
        reject(new Error(`Command stderr: ${stderr}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Run tests
testPresetAPI().catch(console.error);