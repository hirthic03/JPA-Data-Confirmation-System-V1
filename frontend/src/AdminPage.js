
import React, { useEffect, useState } from 'react';
import './App.css';

// eslint-disable-next-line no-undef
const BASE_URL = 'https://jpa-data-confirmation-system-v1.onrender.com';

export default function AdminReportPage() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);

  const [inboundQuestions, setInboundQuestions] = useState([]);
  const [inboundGrouped, setInboundGrouped] = useState([]);   // <-- we’ll use this everywhere

  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [pwInput, setPwInput] = useState('');

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 500);
};

// Helper: Get group name for a data element
const getGroupNameForDataElement = (elementName, submission) => {
  const matchedGroup = submission.elements?.find(group =>
    group.fields.includes(elementName)
  );
  return matchedGroup ? ` (${matchedGroup.group})` : '';
};

useEffect(() => {

  Promise.all([
    fetch(`${BASE_URL}/all-submissions`).then(res => res.json()),
    fetch(`${BASE_URL}/inbound-submissions`).then(res => res.json()),
    fetch(`${BASE_URL}/inbound-submissions-grouped`).then(res => res.json())
  .then(data => data.map(d => ({ ...d, elements: d.elements || [] })))

  ])
    .then(([confirmRows, plainQuestions, groupedSubs]) => {
      setData(confirmRows);
      setFilteredData(confirmRows);

      const qWithGrid = plainQuestions.map(q => {
        if (q.question_id !== 'dataInvolved') return q;
        const g = groupedSubs.find(s => s.submission_uuid === q.submission_uuid);
        if (process.env.NODE_ENV !== 'production') console.log('Trigger redeploy');
        return { ...q, gridData: g?.gridData || [] };
      });
      setInboundQuestions(qWithGrid);
      setInboundGrouped(groupedSubs);
    })
    .catch(err => console.error('Fetch error:', err))
    .finally(() => setLoading(false));
}, []);


  useEffect(() => {
    if (filter === 'All') {
      setFilteredData(data);
    } else {
      setFilteredData(data.filter((item) => item.flow_type === filter));
    }
  }, [filter, data]);
const renderInboundTable = () => (
  <div>
    <h2>Inbound Requirement Submissions</h2>
    {inboundGrouped.length === 0 ? (
      <p>No submissions available.</p>
    ) : (
      inboundGrouped.map(submission => {
        const matchingQuestions = submission.questions
        .filter(q => q.question_id !== 'module');   // ⬅️ added filter

        return (
          <div key={submission.id} className="submission-box">
            {/*Header Table with Metadata*/}
            <table className="submission-table">
              <thead>
                <tr>
                  <th colSpan="2">
                    Submission #{submission.id}
                    <button
                      style={{ float: 'right' }}
                      onClick={() => window.print()}
                      className="download-btn"
                    >
                      📥 Download
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr><td><strong>system</strong></td><td>{submission.system}</td></tr>
                <tr><td><strong>api</strong></td><td>{submission.api}</td></tr>
                <tr><td><strong>module</strong></td><td>{submission.module}</td></tr>
                <tr><td><strong>created_at</strong></td><td>{submission.created_at}</td></tr>
              </tbody>
            </table>

            {/* All Questions for this submission */}
            {matchingQuestions.map((q, idx) => (
              <div key={q.id} style={{ margin: '10px 0' }}>
                <strong>Q{idx + 1}: {q.question_id}</strong>
                <div style={{ marginLeft: '1rem' }}>
                  <strong>Answer:</strong> {q.answer || '—'}
                  {q.file_path && (
                    <>
                      &nbsp;|&nbsp;
                      <a
                        href={`https://jpa-data-confirmation-system-v1.onrender.com/${q.file_path}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download file
                      </a>
                    </>
                  )}
                </div>
              </div>
            ))}

            {/* Grid Table if available */}
            {submission.gridData?.length > 0 ? (
              <>
                <h4>Grid Data</h4>
                <table className="grid-table">
                  <thead>
  <tr>
    <th>#</th>
   <th>Data Element</th>
    <th>Nama</th><th>Jenis</th>
    <th>Saiz</th><th>Nullable</th><th>Rules</th>
  </tr>
</thead>
                  <tbody>
                    {submission.gridData.map((row, idx) => (
                      <tr key={`${row.data_element}-${idx}`}>
                        <td>{idx + 1}</td>
                        <td>
  {row.data_element}
  {getGroupNameForDataElement(row.data_element, submission)}
</td>

                        <td>{row.nama}</td>
                        <td>{row.jenis}</td>
                        <td>{row.saiz}</td>
                        <td>{row.nullable}</td>
                        <td>{row.rules}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p style={{ fontStyle: 'italic', marginTop: '10px' }}>
                No grid data for this submission.
              </p>
            )}
          </div>
        );
      })
    )}
  </div>
);

// ─── Password Gate ─────────────────────────────────────────
if (!authenticated) {
  return (
    <div className="admin-login">
      <h2>🔒 Admin Access</h2>
      <input
        type="password"
        placeholder="Enter admin password"
        value={pwInput}
        onChange={e => setPwInput(e.target.value)}
      />
      <button
        onClick={() => {
          if (pwInput === 'YourSecret123') {     // ← set your password here
            setAuthenticated(true);
          } else {
            alert('Wrong password!');
            setPwInput('');
          }
        }}
      >
        Login
      </button>
    </div>
  );
}

  if (loading) {
  return <div className="admin-container"><h2>📊 Admin Report Dashboard</h2><p>Loading data...</p></div>;
}
  return (
    <div className="admin-container">
      <h2 className="admin-title">📊 Admin Report Dashboard</h2>

        {/* 💾 One-click backup */}
  <button
    className="backup-btn"
    style={{ marginBottom: '1rem' }}
    onClick={async () => {
      try {
        const resp = await fetch(`${BASE_URL}/export-backup`);
        if (!resp.ok) throw new Error('Network response was not ok');
        const blob = await resp.blob();
        downloadBlob(blob, `confirmation_backup_${Date.now()}.db`);
      } catch (err) {
        console.error(err);
        alert('Backup download failed – see console for details.');
      }
    }}
  >
    💾 Download Backup&nbsp;<small>(.db)</small>
  </button>

      <div className="filter-buttons">
        <button onClick={() => setFilter('All')}>All</button>
        <button onClick={() => setFilter('Inbound')}>Inbound</button>
        <button onClick={() => setFilter('Outbound')}>Outbound</button>
      </div>

      {/* --------- 1. Data Element Submissions --------- */}
      <div className="admin-table-container">
        <h3>Data Element Submissions</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th><th>System</th><th>API</th>
              <th>Data Element</th><th>Confirmed</th><th>Remarks</th>
              <th>Timestamp</th><th>Flow Type</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length ? (
              filteredData.map(row => (
                <tr key={row.id}>
                  <td>{row.id}</td><td>{row.system_name}</td>
                  <td>{row.module_name}</td><td>{row.data_element}</td>
                  <td>{row.is_confirmed ? 'Yes' : 'No'}</td>
                  <td>{row.remarks}</td><td>{row.created_at}</td>
                  <td>{row.flow_type}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="8" style={{ textAlign:'center' }}>No data available.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --------- 2. Inbound Requirement Q&A --------- */}
      {(filter === 'All' || filter === 'Inbound') && (
        <div className="admin-table-container">
          <h3>Inbound Requirement Questions</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th><th>System</th><th>API</th>
                <th>Question ID</th><th>Question</th><th>Answer</th>
                <th>File</th><th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {inboundQuestions.length ? (
                inboundQuestions.map(row => (
                  <tr key={row.id}>
                    <td>{row.id}</td><td>{row.system_name}</td>
                    <td>{row.module_name}</td><td>{row.question_id}</td>
                    <td>{row.question_text}</td>
                    <td>
                      <pre style={{ whiteSpace:'pre-wrap' }}>{row.answer}</pre>
                      {row.question_id === 'dataInvolved' && row.gridData?.length > 0 && (
                        <table className="mini-grid" key={`grid-${row.id}`}>
                          <thead>
                            <tr>
                              <th>Data Element</th>
                              <th>Nama</th><th>Jenis</th><th>Saiz</th>
                              <th>Nullable</th><th>Rules</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.gridData.map((g, i) => (
                              <tr key={`${g.data_element}-${i}`}>
                                <td>{g.data_element}</td>
                                <td>{g.nama}</td><td>{g.jenis}</td>
                                <td>{g.saiz}</td><td>{g.nullable}</td>
                                <td>{g.rules}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                    <td>
                      {row.file_path ? (
                        <a href={`${BASE_URL}/${row.file_path}`} target="_blank" rel="noreferrer">Download</a>
                      ) : '—'}
                    </td>
                    <td>{row.created_at}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="8" style={{textAlign:'center'}}>No inbound questions submitted.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* --------- 3. Inbound Data Grid (Grouped) --------- */}
      {(filter === 'All' || filter === 'Inbound') && renderInboundTable()}
    </div>
  );
}
