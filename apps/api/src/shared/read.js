/**
 * Request body reading utility
 */

export const readRequestBody = async (request) => {
  try {
    if (!request || !request.method) {
      throw new Error('Invalid request object');
    }

    // Only parse body for specific HTTP methods
    const methodsWithBody = ['POST', 'PUT', 'PATCH'];
    if (!methodsWithBody.includes(request.method.toUpperCase())) {
      return null;
    }

    return new Promise((resolve, reject) => {
      let body = '';
      
      request.on('data', chunk => {
        body += chunk.toString();
      });
      
      request.on('end', () => {
        try {
          if (body.trim() === '') {
            resolve(null);
          } else {
            const parsed = JSON.parse(body);
            resolve(parsed);
          }
        } catch (error) {
          reject(new Error('Invalid JSON in request body'));
        }
      });
      
      request.on('error', error => {
        reject(error);
      });
    });
  } catch (error) {
    throw new Error(`Failed to read request body: ${error.message}`);
  }
};