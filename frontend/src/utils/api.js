import axios from 'axios';

const api = axios.create({
  baseURL: 'https://jpa-data-confirmation-system-v1.onrender.com',
});

export default api;
