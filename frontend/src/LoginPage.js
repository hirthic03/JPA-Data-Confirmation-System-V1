import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { jwtDecode } from 'jwt-decode';
import api from './utils/api';
import { Link, useNavigate } from 'react-router-dom';

function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Clear any stale auth state on mount
  useEffect(() => {
    // Clear all auth-related storage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('role');
    localStorage.removeItem('agency');
    sessionStorage.clear();
    
    // Reset axios default headers
    if (api.defaults) {
      delete api.defaults.headers.common['Authorization'];
    }
    
    // Prevent autofill
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
      input.setAttribute('autocomplete', 'off');
    });
  }, []);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const validateForm = () => {
    if (!email || !password) {
      setError('Sila masukkan email dan kata laluan');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Format email tidak sah');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/login', { 
        email: email.trim(), 
        password 
      });

      const { token, user } = response.data;

      if (!token) {
        throw new Error('Token tidak diterima dari server');
      }

      // Decode and validate token
      let decoded;
      try {
        decoded = jwtDecode(token);
      } catch (decodeError) {
        throw new Error('Token tidak sah');
      }

      // Validate token expiry
      if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        throw new Error('Token telah tamat tempoh');
      }

      // Clear any existing auth data first
      localStorage.clear();
      sessionStorage.clear();

      // Store new auth data
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('role', decoded.role || user.role);
      localStorage.setItem('agency', decoded.agency || user.agency);

      // Set axios default header
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // Call parent callback if provided
      if (onLogin) {
        onLogin(user);
      }

      // Validate agency access
      if (!decoded.agency && !user.agency) {
        setError('Akaun anda tidak mempunyai agensi yang sah. Sila hubungi pentadbir.');
        // Clean up invalid login
        localStorage.clear();
        delete api.defaults.headers.common['Authorization'];
        return;
      }

      // Navigate to submission page
      navigate('/submission', { replace: true });
      
    } catch (err) {
      console.error('Login error:', err);
      
      // Clear any partial auth state
      localStorage.clear();
      sessionStorage.clear();
      if (api.defaults) {
        delete api.defaults.headers.common['Authorization'];
      }
      
      const errorMessage = err?.response?.data?.error || 
                          err?.message || 
                          'Log masuk gagal. Sila cuba lagi.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="form-container">
      <h2>Log Masuk</h2>
      <form onSubmit={handleSubmit} autoComplete="off">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="off"
          disabled={isLoading}
          className="form-input"
        />
        <input
          type="password"
          placeholder="Kata Laluan"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="off"
          disabled={isLoading}
          className="form-input"
        />
        <button 
          type="submit"
          disabled={isLoading}
          className="submit-button"
        >
          {isLoading ? 'Sedang log masuk...' : 'Log Masuk'}
        </button>
      </form>
      
      {error && (
        <div className="message error">
          {error}
        </div>
      )}
      
      <p className="link">
        Belum mempunyai akaun? <Link to="/register">Daftar di sini</Link>
      </p>
    </div>
  );
}

export default LoginPage;