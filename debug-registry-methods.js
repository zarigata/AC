import { AgentRegistry } from './apps/api/src/registry.js';

async function debugRegistryMethods() {
  console.log('=== DEBUG REGISTRY METHODS ===');
  
  const databasePath = './data/zsiistant.sqlite';
  console.log('Using database path:', databasePath);
  
  try {
    const registry = new AgentRegistry({ databasePath });
    
    // Check available methods
    console.log('Available registry methods:');
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(registry));
    methods.forEach(method => {
      console.log(`- ${method}`);
    });
    
    console.log('\nChecking for preset methods:');
    const presetMethods = methods.filter(method => method.includes('preset'));
    console.log('Preset methods:', presetMethods);
    
    // Check if getAllPresets exists
    if (typeof registry.getAllPresets === 'function') {
      console.log('✅ getAllPresets is a function');
      
      try {
        const presets = await registry.getAllPresets();
        console.log(`✅ getAllPresets works, found ${presets.length} presets`);
      } catch (error) {
        console.log('❌ getAllPresets error:', error.message);
      }
    } else {
      console.log('❌ getAllPresets is not a function');
    }
    
    // Check if getPresetById exists
    if (typeof registry.getPresetById === 'function') {
      console.log('✅ getPresetById is a function');
    } else {
      console.log('❌ getPresetById is not a function');
    }
    
    // Check if createPreset exists
    if (typeof registry.createPreset === 'function') {
      console.log('✅ createPreset is a function');
    } else {
      console.log('❌ createPreset is not a function');
    }
    
    // Check if updatePreset exists
    if (typeof registry.updatePreset === 'function') {
      console.log('✅ updatePreset is a function');
    } else {
      console.log('❌ updatePreset is not a function');
    }
    
    // Check if deletePreset exists
    if (typeof registry.deletePreset === 'function') {
      console.log('✅ deletePreset is a function');
    } else {
      console.log('❌ deletePreset is not a function');
    }
    
    // Check if applyPreset exists
    if (typeof registry.applyPreset === 'function') {
      console.log('✅ applyPreset is a function');
    } else {
      console.log('❌ applyPreset is not a function');
    }
    
    // Check registry constructor
    console.log('\nRegistry prototype:');
    console.log('Constructor name:', registry.constructor.name);
    console.log('Prototype:', Object.getPrototypeOf(registry));
    
    // Try to see if preset methods are defined somewhere else
    console.log('\nLooking for preset methods in the registry object:');
    const ownMethods = Object.getOwnPropertyNames(registry);
    console.log('Own methods:', ownMethods);
    
    // Check prototype chain
    let proto = Object.getPrototypeOf(registry);
    let level = 0;
    while (proto && level < 5) {
      console.log(`\nPrototype level ${level}:`);
      const protoMethods = Object.getOwnPropertyNames(proto);
      const protoPresetMethods = protoMethods.filter(method => method.includes('preset'));
      console.log('Methods:', protoMethods);
      console.log('Preset methods:', protoPresetMethods);
      
      if (protoPresetMethods.length > 0) {
        console.log('✅ Found preset methods in prototype level', level);
      }
      
      proto = Object.getPrototypeOf(proto);
      level++;
    }
    
  } catch (error) {
    console.error('❌ Error creating registry:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugRegistryMethods().catch(console.error);