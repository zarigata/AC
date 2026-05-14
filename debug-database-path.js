import { AgentRegistry } from './apps/api/src/registry.js';

async function debugDatabasePath() {
  console.log('=== DEBUG DATABASE PATH ===');
  
  // Check different possible database paths
  const possiblePaths = [
    './data/zsiistant.sqlite',
    './apps/api/data/zsiistant.sqlite',
    '../data/zsiistant.sqlite',
    '/app/data/zsiistant.sqlite',
    '/root/.openclaw/workspace/AC/data/zsiistant.sqlite',
    process.env.ZSIISTANT_DB_PATH,
    new URL('../data/zsiistant.sqlite', import.meta.url).pathname,
    new URL('./data/zsiistant.sqlite', import.meta.url).pathname,
  ];
  
  console.log('Testing different database paths...\n');
  
  for (const path of possiblePaths) {
    if (!path) continue;
    
    console.log(`Testing path: ${path}`);
    
    try {
      // Check if file exists
      const fs = await import('fs');
      if (fs.existsSync(path)) {
        console.log('✅ File exists');
        
        // Try to connect to database
        const registry = new AgentRegistry({ databasePath: path });
        
        // Test basic operations
        const presets = await registry.getAllPresets();
        console.log(`✅ Connected successfully, found ${presets.length} presets`);
        
        // Test creating a preset
        const testPreset = {
          id: `path-test-${Date.now()}`,
          name: 'Path Test',
          description: 'Test for path',
          configTemplate: { path: true },
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        await registry.createPreset(testPreset);
        console.log('✅ Created test preset successfully');
        
        // Test getting preset
        const createdPreset = await registry.getPresetById(testPreset.id);
        console.log('✅ Retrieved test preset:', createdPreset?.name);
        
        // Clean up
        await registry.deletePreset(testPreset.id);
        console.log('✅ Cleaned up test preset');
        
        console.log('🎉 This path works perfectly!\n');
        
      } else {
        console.log('❌ File does not exist\n');
      }
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}\n`);
    }
  }
  
  // Check current working directory
  console.log('=== Current Working Directory ===');
  try {
    const path = await import('path');
    const { cwd } = await import('process');
    console.log(`Current directory: ${cwd()}`);
    console.log(`Directory contains: ${fs.readdirSync(cwd()).join(', ')}`);
  } catch (error) {
    console.log('Error getting current directory:', error.message);
  }
  
  // Check environment variables
  console.log('\n=== Environment Variables ===');
  console.log('ZSIISTANT_DB_PATH:', process.env.ZSIISTANT_DB_PATH);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('PORT:', process.env.PORT);
  console.log('HOST:', process.env.HOST);
  
  // Test with the server's default path logic
  console.log('\n=== Server Default Path Logic ===');
  try {
    // Simulate the server's path logic
    const defaultPath = process.env.ZSIISTANT_DB_PATH ?? new URL("../data/zsiistant.sqlite", import.meta.url).pathname;
    console.log('Server would use this path:', defaultPath);
    
    const fs = await import('fs');
    if (fs.existsSync(defaultPath)) {
      console.log('✅ Server path exists');
      
      const registry = new AgentRegistry({ databasePath: defaultPath });
      const presets = await registry.getAllPresets();
      console.log(`✅ Server path has ${presets.length} presets`);
      
    } else {
      console.log('❌ Server path does not exist');
    }
    
  } catch (error) {
    console.log('Error with server path logic:', error.message);
  }
  
  console.log('\n=== DATABASE PATH DEBUG COMPLETE ===');
}

debugDatabasePath().catch(console.error);