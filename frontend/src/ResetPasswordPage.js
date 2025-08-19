import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import './App.css';

function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    // Verify token on mount
    const verifyToken = async () => {
      if (!token) {
        setMessage('Token tidak sah');
        setIsChecking(false);
        return;
      }

      try {
        const response = await axios.get(
          `${process.env.REACT_APP_API_BASE_URL}/verify-reset-token/${token}`
        );
        
        if (response.data.success) {
          setIsValidToken(true);
        }
      } catch (err) {
        setMessage('Token tidak sah atau telah tamat tempoh');
      } finally {
        setIsChecking(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password.length < 8) {
      setMessage('Kata laluan mestilah sekurang-kurangnya 8 aksara');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Kata laluan tidak sepadan');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const response = await axios.post(
        `${process.env.REACT_APP_API_BASE_URL}/reset-password`,
        { token, password }
      );

      if (response.data.success) {
        setMessage('Kata laluan berjaya ditetapkan semula!');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Ralat sistem. Sila cuba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="form-container">
        <h2>Menyemak...</h2>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="form-container">
        <h2>Pautan Tidak Sah</h2>
        <p style={{ textAlign: 'center', color: '#dc3545' }}>
          {message || 'Pautan tetapan semula tidak sah atau telah tamat tempoh.'}
        </p>
        <p className="link">
          <a href="/forgot-password">Minta pautan baharu</a>
        </p>
      </div>
    );
  }

  return (
    <div className="form-container">
      <h2>Tetapkan Kata Laluan Baharu</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Kata Laluan Baharu (minimum 8 aksara)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          className="form-input"
          required
        />
        <input
          type="password"
          placeholder="Sahkan Kata Laluan Baharu"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={isLoading}
          className="form-input"
          required
        />
        <button
          type="submit"
          disabled={isLoading}
          className="submit-button"
        >
          {isLoading ? 'Menetapkan...' : 'Tetapkan Kata Laluan'}
        </button>
      </form>

      {message && (
        <div className={`message ${message.includes('berjaya') ? 'success' : 'error'}`}>
          {message}
        </div>
      )}
    </div>
  );
}

export default ResetPasswordPage;