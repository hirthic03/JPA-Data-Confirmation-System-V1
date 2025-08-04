import axios from 'axios';

// Create axios instance
const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Token refresh flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
};

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    
    // Skip auth header for login/register endpoints
    const authEndpoints = ['/login', '/register'];
    const isAuthEndpoint = authEndpoints.some(endpoint => 
      config.url.includes(endpoint)
    );
    
    if (token && !isAuthEndpoint) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Add cache-busting for GET requests
    if (config.method === 'get') {
      config.params = {
        ...config.params,
        _t: Date.now()
      };
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle auth errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't retry for login/register endpoints
      if (originalRequest.url.includes('/login') || 
          originalRequest.url.includes('/register')) {
        return Promise.reject(error);
      }
      
      originalRequest._retry = true;
      
      // Check if token exists
      const token = localStorage.getItem('token');
      if (!token) {
        // No token, redirect to login
        clearAuthAndRedirect();
        return Promise.reject(error);
      }
      
      // Check if token is expired
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 < Date.now()) {
          // Token expired, clear and redirect
          clearAuthAndRedirect();
          return Promise.reject(error);
        }
      } catch (e) {
        // Invalid token format
        clearAuthAndRedirect();
        return Promise.reject(error);
      }
      
      // Token seems valid but still got 401, might be server issue
      // Clear auth and redirect
      clearAuthAndRedirect();
      return Promise.reject(error);
    }
    
    // Handle 403 errors (forbidden)
    if (error.response?.status === 403) {
      // User doesn't have permission
      console.error('Access forbidden:', error.response.data);
    }
    
    return Promise.reject(error);
  }
);

// Helper function to clear auth and redirect
const clearAuthAndRedirect = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('role');
  localStorage.removeItem('agency');
  sessionStorage.clear();
  
  // Redirect to login
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

// Helper to manually set auth token
export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem('token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
  }
};

// Helper to check if user is authenticated
export const isAuthenticated = () => {
  const token = localStorage.getItem('token');
  if (!token) return false;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch (e) {
    return false;
  }
};

// Helper to get current user
export const getCurrentUser = () => {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
};

// Helper to clear all auth data
export const clearAuth = () => {
  clearAuthAndRedirect();
};

export default api;