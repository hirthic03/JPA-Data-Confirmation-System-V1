import React, { useState } from 'react';
import axios from 'axios';
import './App.css'; // optional styling
import { jwtDecode } from 'jwt-decode';

const api = axios.create({
  baseURL: 'https://jpa-data-confirmation-system-v1.onrender.com',
});

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await api.post('/login', { email, password });

      const { token, user } = response.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

const decoded = jwtDecode(token);
    localStorage.setItem('role', decoded.role);
    localStorage.setItem('agency', decoded.agency || '');

      if (onLogin) onLogin(user); // callback to app
    } catch (err) {
      setError(err?.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div className="form-container">
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email (e.g. agency1@jpa.gov.my)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password (e.g. agency123)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit">Log In</button>
      </form>
    </div>
  );
}

export default LoginPage;
