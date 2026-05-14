import { AgentRegistry } from './apps/api/src/registry.js';

async function testServerRoutes() {
  console.log('Testing server routes...');
  
  const databasePath = './data/zsiistant.sqlite';
  const registry = new AgentRegistry({ databasePath });
  
  try {
    // Test if registry can be initialized
    await registry.seed();
    console.log('✅ Registry seeded successfully');
    
    // Test if preset methods exist
    console.log('Available registry methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(registry)));
    
    // Test preset methods
    const testPreset = {
      id: 'test-id',
      name: 'Test Preset',
      description: 'A test preset',
      configTemplate: { test: 'value' },
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    console.log('Creating test preset...');
    await registry.createPreset(testPreset);
    console.log('✅ Preset created successfully');
    
    const presets = await registry.getAllPresets();
    console.log('✅ Retrieved presets:', presets.length);
    
    const preset = await registry.getPresetById('test-id');
    console.log('✅ Retrieved preset:', preset?.name);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testServerRoutes().catch(console.error);