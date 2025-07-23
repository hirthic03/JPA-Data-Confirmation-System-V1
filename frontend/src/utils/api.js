import axios from 'axios';

const api = axios.create({
  baseURL: 'https://your-backend-app.onrender.com', // ✅ Replace with real backend URL
  withCredentials: true                             // ✅ Required for auth headers / cookies
});

export default api;