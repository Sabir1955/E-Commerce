export const environment = {
  production: true,
  backendUrl: typeof window !== 'undefined' ? '' : 'http://localhost:5000',
  apiUrl: typeof window !== 'undefined' ? '/api' : 'http://localhost:5000/api'
};
