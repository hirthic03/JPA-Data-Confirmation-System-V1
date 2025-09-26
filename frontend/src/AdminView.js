import React, { useState } from 'react';
import axios from 'axios';

export default function AdminView() {
  const [password, setPassword] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        'https://jpa-data-confirmation-system-v1.onrender.com/admin-view-submissions',
        { headers: { 'x-admin-password': password } }
      );
      setSubmissions(response.data);
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setLoading(false);
  };

const downloadCSV = async () => {
  try {
    const response = await axios.get(
      'https://jpa-data-confirmation-system-v1.onrender.com/export-submissions-csv',
      { 
        headers: { 'x-admin-password': password },
        responseType: 'blob'
      }
    );
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'submissions.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    alert('Error downloading CSV: ' + err.message);
  }
};

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin View - Submissions</h2>
      
      <div>
        <input
          type="password"
          placeholder="Admin Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={fetchSubmissions} disabled={loading}>
          {loading ? 'Loading...' : 'View Submissions'}
        </button>
        <button onClick={downloadCSV}>Download CSV</button>
      </div>

      {submissions.map(sub => (
        <div key={sub.submission_uuid} style={{ 
          border: '1px solid #ccc', 
          padding: 10, 
          margin: '10px 0' 
        }}>
          <h3>{sub.system} - {sub.api}</h3>
          <p>ID: {sub.submission_uuid}</p>
          <p>Date: {sub.created_at}</p>
          
          <h4>Answers:</h4>
          {sub.questions.map((q, i) => (
            <div key={i}>
              <strong>{q.question}:</strong> {q.answer}
            </div>
          ))}
          
          <h4>Grid Data ({sub.gridData.length} rows):</h4>
          <table border="1">
            <thead>
              <tr>
                <th>Element</th>
                <th>Nama</th>
                <th>Jenis</th>
                <th>Saiz</th>
              </tr>
            </thead>
            <tbody>
              {sub.gridData.map((row, i) => (
                <tr key={i}>
                  <td>{row.data_element}</td>
                  <td>{row.nama}</td>
                  <td>{row.jenis}</td>
                  <td>{row.saiz}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}