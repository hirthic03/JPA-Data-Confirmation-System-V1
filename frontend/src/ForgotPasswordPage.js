import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './App.css';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email) {
      setMessage('Sila masukkan email anda');
      setIsSuccess(false);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setMessage('Format email tidak sah');
      setIsSuccess(false);
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const response = await axios.post(
        `${process.env.REACT_APP_API_BASE_URL}/forgot-password`,
        { email }
      );

      if (response.data.success) {
        setIsSuccess(true);
        setMessage('Arahan tetapan semula telah dihantar ke email anda. Sila semak inbox anda.');
        setEmail('');
      }
    } catch (err) {
      setIsSuccess(false);
      setMessage(err.response?.data?.message || 'Ralat sistem. Sila cuba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="form-container">
      <h2>Lupa Kata Laluan</h2>
      {!isSuccess ? (
        <>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '20px' }}>
            Masukkan email anda untuk menerima arahan tetapan semula kata laluan.
          </p>
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="form-input"
              required
            />
            <button
              type="submit"
              disabled={isLoading}
              className="submit-button"
            >
              {isLoading ? 'Menghantar...' : 'Hantar Arahan'}
            </button>
          </form>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
          <p style={{ color: '#28a745', marginBottom: '20px' }}>
            {message}
          </p>
        </div>
      )}

      {message && !isSuccess && (
        <div className="message error">
          {message}
        </div>
      )}

      <p className="link">
        <Link to="/login">← Kembali ke Log Masuk</Link>
      </p>
    </div>
  );
}

export default ForgotPasswordPage;