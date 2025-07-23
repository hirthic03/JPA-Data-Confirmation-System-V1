import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL, // ✅ Replace with real backend URL
  withCredentials: true                             // ✅ Required for auth headers / cookies
});

export default api;