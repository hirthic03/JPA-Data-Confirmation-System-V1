import React, { useState } from 'react';
import axios from 'axios';
import './App.css'; // Optional for styling

function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('agency');
  const [agency, setAgency] = useState('');
  const [message, setMessage] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_BASE_URL}/register`, {
        email,
        password,
        role,
        agency
      });
      setMessage(res.data.message);
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div className="form-container">
      <h2>Register</h2>
      <form onSubmit={handleRegister}>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
       <select value={agency} onChange={e => setAgency(e.target.value)} required>
  <option value="">-- Pilih Agensi --</option>
  <option value="JPA">JPA</option>
  <option value="Other">Lain-lain</option>
</select>
{agency === 'Other' && (
  <input
    type="text"
    placeholder="Taip nama agensi lain"
    onChange={e => setAgency(e.target.value)}
  />
)}
        <select value={role} onChange={e => setRole(e.target.value)}>
          <option value="agency">Agency</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit">Register</button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
}

export default RegisterPage;
