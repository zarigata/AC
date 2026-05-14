import { AgentRegistry } from './apps/api/src/registry.js';

async function testPresetCreation() {
  console.log('Testing preset creation...');
  
  const databasePath = './data/zsiistant.sqlite';
  const registry = new AgentRegistry({ databasePath });
  
  try {
    // Test with minimal preset data
    const testPreset = {
      id: 'test-preset-1',
      name: 'Test Preset',
      description: 'A test preset for validation',
      configTemplate: { test: 'value', model: 'qwen3:1.7b' },
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
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    
    // Try with simpler data
    console.log('\nTrying with simpler data...');
    try {
      const simplePreset = {
        id: 'simple-preset',
        name: 'Simple',
        description: 'Simple preset',
        configTemplate: {},
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await registry.createPreset(simplePreset);
      console.log('✅ Simple preset created');
    } catch (simpleError) {
      console.error('❌ Simple error:', simpleError.message);
    }
  }
}

testPresetCreation().catch(console.error);