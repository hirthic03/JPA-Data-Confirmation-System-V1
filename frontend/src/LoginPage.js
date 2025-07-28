import React, { useState } from 'react';
import axios from 'axios';
import './App.css'; // optional styling
import { jwtDecode } from 'jwt-decode';
import api from './utils/api';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';


function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
    localStorage.setItem('agency', decoded.agency);

      if (onLogin) onLogin(user);

// 🔒 Check agency and redirect
if (decoded.agency) {
  navigate('/submission');
} else {
  alert("Akses hanya dibenarkan kepada pengguna agensi yang sah.");
}
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
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />
        <button type="submit">Log In</button>
      </form>
      {message && <p className="error">{message}</p>}
      <p className="link">
        Don't have an account? <Link to="/register">Register here</Link>
      </p>
    </div>
  );
}
export default LoginPage;
