import { getAuthToken } from './authToken';

export async function fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<Response> {
  let retries = 0;
  const token = getAuthToken();
  
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  const finalOptions = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
  };

  while (retries < maxRetries) {
    try {
      const response = await fetch(url, finalOptions);
      
      // If 409 Conflict, it might be a temporary processing state (lock), retry ONLY if it identifies as such.
      if (response.status === 409 && retries < maxRetries - 1) {
        const clonedResponse = response.clone();
        const data = await clonedResponse.json().catch(() => ({}));
        if (data.error && data.error.includes('currently being processed by another operation')) {
          retries++;
          // Exponential backoff: 1s, 2s, 4s...
          const delay = Math.pow(2, retries - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  }
  
  // Fallback (should not be reached due to return in loop)
  return fetch(url, finalOptions);
}
