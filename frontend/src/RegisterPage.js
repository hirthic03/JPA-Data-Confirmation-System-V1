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
    
    // Comprehensive autofill prevention
    const preventAutofill = () => {
      const inputs = document.querySelectorAll('input');
      inputs.forEach(input => {
        // Set all possible autocomplete attributes
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');
        
        // Password manager specific
        input.setAttribute('data-lpignore', 'true');
        input.setAttribute('data-form-type', 'other');
        input.setAttribute('data-1p-ignore', 'true');
        
        // Make inputs readonly initially
        if (input.type === 'password' || input.type === 'email') {
          input.setAttribute('readonly', 'readonly');
          
          // Remove readonly on focus
          input.addEventListener('focus', function() {
            this.removeAttribute('readonly');
          });
          
          // Clear value on mount
          input.value = '';
        }
      });
      
      // Disable form autofill
      const forms = document.querySelectorAll('form');
      forms.forEach(form => {
        form.setAttribute('autocomplete', 'off');
      });
    };
    
    // Run immediately
    preventAutofill();
    
    // Run after delay to catch dynamic elements
    const timer1 = setTimeout(preventAutofill, 100);
    const timer2 = setTimeout(preventAutofill, 500);
    
    // Clean up function
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  // Load agencies from systems.json - FIXED VERSION
  useEffect(() => {
    const loadAgencies = async () => {
      try {
        const response = await api.get('/systems');
        const systemsData = response.data;
        
        console.log('Full systems data:', systemsData); // Debug log
        
        // Extract agencies from Inbound section only
        const agencies = [];
        
        if (systemsData.Inbound) {
          // Get only the top-level keys from Inbound (these are the agencies)
          const inboundKeys = Object.keys(systemsData.Inbound);
          console.log('Inbound keys found:', inboundKeys); // Debug log
          
          // In your systems.json, the agencies are: JPA and eSILA
          inboundKeys.forEach(key => {
            // Verify this is actually an agency by checking its structure
            const agencyData = systemsData.Inbound[key];
            
            if (typeof agencyData === 'object' && agencyData !== null) {
              // An agency should have systems as its children
              // Don't add keys that look like modules or other data
              const isValidAgency = Object.keys(agencyData).some(systemKey => {
                const system = agencyData[systemKey];
                // A valid system should have modules
                return system && typeof system === 'object' && 
                       (system.modules || system.title || system.elements);
              });
              
              if (isValidAgency) {
                agencies.push(key);
                console.log(`Added agency: ${key}`); // Debug log
              }
            }
          });
        }
        
        // Remove duplicates and sort
        const uniqueAgencies = [...new Set(agencies)].sort();
        console.log('Final loaded agencies:', uniqueAgencies); // Debug log
        setAvailableAgencies(uniqueAgencies);
        
      } catch (error) {
        console.error('Failed to load agencies:', error);
        // Set default agencies if loading fails
        setAvailableAgencies(['JPA', 'eSILA']);
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
      
      console.log('Registering with agency:', finalAgency); // Debug log
      
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
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          data-lpignore="true"
          data-form-type="other"
          data-1p-ignore="true"
          name={`email-${Date.now()}`}
          disabled={isLoading}
          className="form-input"
          onFocus={(e) => {
            if (e.target.hasAttribute('readonly')) {
              e.target.removeAttribute('readonly');
            }
          }}
        />
        
        {/* Password fields with maximum autocomplete prevention */}
        <input
          type="password"
          placeholder="Kata Laluan (minimum 8 aksara)"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          data-lpignore="true"
          data-form-type="other"
          data-1p-ignore="true"
          name={`password-${Date.now()}`}
          disabled={isLoading}
          className="form-input"
          readOnly
          onFocus={(e) => {
            e.target.removeAttribute('readonly');
          }}
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