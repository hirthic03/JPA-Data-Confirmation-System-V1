import React, { useState, useEffect } from 'react';
import axios from 'axios';
import api from './utils/api';
import './App.css';
import { useNavigate } from 'react-router-dom';

function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('agency');
  const [agency, setAgency] = useState('');
  const [customAgency, setCustomAgency] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableAgencies, setAvailableAgencies] = useState([]);
  const navigate = useNavigate();

  // Clear form on mount and prevent autofill
  useEffect(() => {
    // Clear any stored form data
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setAgency('');
    setCustomAgency('');
    
    // Prevent autofill
    const preventAutofill = () => {
      const inputs = document.querySelectorAll('input');
      inputs.forEach(input => {
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('data-lpignore', 'true'); // Disable LastPass
        input.setAttribute('data-form-type', 'other'); // Disable other managers
      });
    };
    
    preventAutofill();
    // Re-run after a delay to catch dynamically rendered inputs
    setTimeout(preventAutofill, 100);
  }, []);

  // Load agencies from systems.json
  useEffect(() => {
    const loadAgencies = async () => {
      try {
        const response = await api.get('/systems');
        const systemsData = response.data;
        
        // Extract all unique agencies from both Inbound and Outbound
        const agencies = new Set();
        
        Object.values(systemsData).forEach(flowType => {
          Object.keys(flowType).forEach(agency => {
            agencies.add(agency);
          });
        });
        
        setAvailableAgencies([...agencies].sort());
      } catch (error) {
        console.error('Failed to load agencies:', error);
        // Fallback to local systems.json
        try {
          const response = await fetch('/systems.json');
          const systemsData = await response.json();
          
          const agencies = new Set();
          Object.values(systemsData).forEach(flowType => {
            Object.keys(flowType).forEach(agency => {
              agencies.add(agency);
            });
          });
          
          setAvailableAgencies([...agencies].sort());
        } catch (fallbackError) {
          console.error('Failed to load fallback agencies:', fallbackError);
        }
      }
    };

    loadAgencies();
  }, []);

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const validateForm = () => {
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setMessage('Sila masukkan email yang sah');
      return false;
    }

    // Password validation
    if (password.length < 8) {
      setMessage('Kata laluan mestilah sekurang-kurangnya 8 aksara');
      return false;
    }

    if (password !== confirmPassword) {
      setMessage('Kata laluan tidak sepadan');
      return false;
    }

    // Agency validation
    if (!agency) {
      setMessage('Sila pilih agensi');
      return false;
    }

    if (agency === 'Other' && !customAgency.trim()) {
      setMessage('Sila masukkan nama agensi');
      return false;
    }

    return true;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    setMessage('');

    try {
      const finalAgency = agency === 'Other' ? customAgency.trim() : agency;
      
      const res = await axios.post(`${process.env.REACT_APP_API_BASE_URL}/register`, {
        email: email.trim(),
        password,
        role,
        agency: finalAgency
      });

      if (res.data.success) {
        // Clear form data
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setAgency('');
        setCustomAgency('');
        setRole('agency');
        
        // Show success message
        setMessage('Pendaftaran berjaya! Sila log masuk.');
        
        // Navigate after 2 seconds
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || 'Pendaftaran gagal. Sila cuba lagi.';
      setMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="form-container">
      <h2>Daftar Akaun</h2>
      <form onSubmit={handleRegister} autoComplete="off" noValidate>
        {/* Email input with enhanced autocomplete prevention */}
        <input
          type="email"
          placeholder="Email (cth: nama@agensi.gov.my)"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="new-password" // Trick browsers
          data-lpignore="true"
          disabled={isLoading}
          className="form-input"
        />
        
        {/* Password fields with maximum autocomplete prevention */}
        <input
          type="password"
          placeholder="Kata Laluan (minimum 8 aksara)"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          data-lpignore="true"
          disabled={isLoading}
          className="form-input"
        />
        
        <input
          type="password"
          placeholder="Sahkan Kata Laluan"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
          data-lpignore="true"
          disabled={isLoading}
          className="form-input"
        />
        
         <select 
          value={agency} 
          onChange={e => {
            setAgency(e.target.value);
            if (e.target.value !== 'Other') {
              setCustomAgency('');
            }
          }} 
          required
          disabled={isLoading || availableAgencies.length === 0}
          className="form-select"
        >
          <option value="">-- Pilih Agensi --</option>
          {availableAgencies.map(agencyName => (
            <option key={agencyName} value={agencyName}>
              {agencyName}
            </option>
          ))}
          <option value="Other">Lain-lain</option>
        </select>
        
        {agency === 'Other' && (
          <input
            type="text"
            placeholder="Nama agensi"
            value={customAgency}
            onChange={e => setCustomAgency(e.target.value)}
            required
            disabled={isLoading}
            className="form-input"
          />
        )}
        
        <select 
          value={role} 
          onChange={e => setRole(e.target.value)}
          disabled={isLoading}
          className="form-select"
        >
          <option value="agency">Agensi</option>
          <option value="admin">Admin</option>
        </select>
        
        <button 
          type="submit" 
          disabled={isLoading}
          className="submit-button"
        >
          {isLoading ? 'Mendaftar...' : 'Daftar'}
        </button>
      </form>
      
      {message && (
        <div className={`message ${message.includes('berjaya') ? 'success' : 'error'}`}>
          {message}
        </div>
      )}
      
      <p className="link">
        Sudah mempunyai akaun? <a href="/login">Log masuk di sini</a>
      </p>
    </div>
  );
}

export default RegisterPage;