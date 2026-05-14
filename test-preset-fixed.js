import { AgentRegistry } from './apps/api/src/registry.js';

async function testPresetCreation() {
  console.log('Testing preset creation with fixed data...');
  
  const databasePath = './data/zsiistant.sqlite';
  const registry = new AgentRegistry({ databasePath });
  
  try {
    // Test with complete preset data
    const testPreset = {
      id: 'test-preset-1',
      name: 'Test Preset',
      description: 'A test preset for validation',
      configTemplate: { test: 'value', model: 'qwen3:1.7b' },
      icon: null, // Provide null instead of undefined
      category: 'general',
      isSystem: false,
      isFeatured: false,
      orderIndex: 0,
      tags: [],
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    console.log('Preset data:', JSON.stringify(testPreset, null, 2));
    
    console.log('Creating preset...');
    await registry.createPreset(testPreset);
    console.log('✅ Preset created successfully');
    
    const presets = await registry.getAllPresets();
    console.log('✅ Retrieved presets:', presets.length);
    
    if (presets.length > 0) {
      console.log('First preset:', presets[0]);
    }
    
    // Test getting individual preset
    const preset = await registry.getPresetById('test-preset-1');
    console.log('✅ Retrieved individual preset:', preset?.name);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testPresetCreation().catch(console.error);