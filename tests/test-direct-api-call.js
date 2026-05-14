import http from 'http';

async function testDirectAPI() {
  console.log('Testing direct API call...');
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: '/api/presets',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'test-agent'
      }
    };
    
    const req = http.request(options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Headers:`, res.headers);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('Response data:', data);
        resolve({ statusCode: res.statusCode, data });
      });
    });
    
    req.on('error', (error) => {
      console.error('Request error:', error.message);
      reject(error);
    });
    
    req.end();
  });
}

// Run the test
testDirectAPI()
  .then((result) => {
    console.log('✅ API call successful');
    console.log('Result:', result);
  })
  .catch((error) => {
    console.error('❌ API call failed:', error.message);
  });