import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import SubmissionApp from './SubmissionApp';
import LoginPage from './LoginPage';
import InboundRequirementForm from './InboundRequirementForm';
import { loadConfirmed } from './utils/confirmedStore';
import './App.css';
import AdminPage from './AdminPage';
import RegisterPage from './RegisterPage';


function ReportingPage() {
  const [submissions, setSubmissions] = useState([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState([]);
  const [systemOptions, setSystemOptions] = useState([]);
  const [selectedSystem, setSelectedSystem] = useState('');

  useEffect(() => {
    fetch('https://jpa-data-confirmation-system-v1.onrender.com/inbound-submissions')
      .then(res => res.json())
      .then(data => {
        setSubmissions(data);
        setFilteredSubmissions(data);
        const systems = [...new Set(data.map(sub => sub.answers.q1).filter(Boolean))];
        setSystemOptions(systems);
      })
      .catch(err => console.error('Failed to load submissions', err));
  }, []);

  const handleFilterChange = (e) => {
    const system = e.target.value;
    setSelectedSystem(system);
    if (system === '') {
      setFilteredSubmissions(submissions);
    } else {
      const filtered = submissions.filter(sub => sub.answers.q1 === system);
      setFilteredSubmissions(filtered);
    }
  };

  const handleDownloadFolders = () => {
    filteredSubmissions.forEach(sub => {
      const timestamp = sub.timestamp;
      fetch(`https://jpa-data-confirmation-system-v1.onrender.com/generate-submission-folder/${encodeURIComponent(timestamp)}`)
        .then(res => {
          if (res.ok) return res.blob();
          else throw new Error('Failed to generate folder');
        })
        .then(blob => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `submission-${timestamp}.zip`;
          link.click();
        })
        .catch(err => {
          console.error('Error downloading ZIP:', err);
        });
    });
  };

  return (
    <div style={{ marginTop: '40px' }}>
      <h3>📊 Inbound Requirement Submissions</h3>

      <div style={{
        margin: '20px 0',
        padding: '10px',
        background: '#f8f8f8',
        borderRadius: '8px',
        display: 'flex',
        gap: '12px',
        alignItems: 'center'
      }}>
        <label><strong>Filter by System (Q1):</strong></label>
        <select
          style={{ padding: '6px 12px', fontSize: '14px' }}
          value={selectedSystem}
          onChange={handleFilterChange}
        >
          <option value="">-- All Systems --</option>
          {systemOptions.map((sys, i) => (
            <option key={i} value={sys}>{sys}</option>
          ))}
        </select>
        <button onClick={handleDownloadFolders} style={{ padding: '6px 12px' }}>
          📦 Download Submission Folders
        </button>
      </div>

      {filteredSubmissions.length === 0 ? (
        <p>No submissions found.</p>
      ) : (
        <div>
          {filteredSubmissions.map((sub, idx) => (
            <div key={idx} className="submission-card">
              <p><strong>Timestamp:</strong> {sub.timestamp}</p>
              <ul>
                {Object.entries(sub.answers).map(([qid, answer]) => (
                  <li key={qid}><strong>{qid.toUpperCase()}:</strong> {answer}</li>
                ))}
              </ul>
              {sub.files && Object.entries(sub.files).length > 0 && (
                <div>
                  <p><strong>Uploaded Files:</strong></p>
                  <ul>
                    {Object.entries(sub.files).map(([qid, fileMeta]) => (
                      <li key={qid}>
                        <a
                          href={`https://jpa-data-confirmation-system-v1.onrender.com/download/${fileMeta.storedName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          📥 Download {fileMeta.originalName}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <hr />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RequirementPage() {
  return (
    <div className="reporting-page">
      <h2>Requirement Page</h2>
      <p>This is a placeholder for requirement view or actions.</p>
      {/* You can later insert a table or other components here */}
    </div>
  );
}


const isLoggedIn = () => !!localStorage.getItem('token');

function App() {
  return (
    <Router>
      <Routes>
       <Route path="/login" element={<LoginPage />} />
<Route path="/register" element={<RegisterPage />} /> {/* ✅ New line for registration */}
<Route
  path="/submission"
  element={isLoggedIn() ? <SubmissionApp /> : <Navigate to="/login" />}
/>
<Route
  path="/"
  element={<Navigate to={isLoggedIn() ? '/submission' : '/login'} />}
/>
<Route
  path="/requirement"
  element={isLoggedIn() ? <InboundRequirementForm /> : <Navigate to="/login" />}
/>


      </Routes>
      
    </Router>
  );
}

export default App;

