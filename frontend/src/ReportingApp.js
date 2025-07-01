import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

function ReportingApp() {
  const [reportData, setReportData] = useState([]);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = () => {
    axios.get('http://localhost:3001/inbound-submissions')
      .then(res => setReportData(res.data))
      .catch(err => {
        console.error('Error fetching report data:', err);
        alert('Failed to fetch report data.');
      });
  };

  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const handleExport = () => {
    window.open("http://localhost:3001/export-csv", "_blank");
  };

  return (
    <div className="container">
      <h1 className="title">JPA Admin Reporting Panel</h1>

      <div style={{ marginBottom: '20px' }}>
        <button onClick={handleExport} className="download-btn">
          Download Full Report (CSV)
        </button>
      </div>

      <div className="table-container">
        <table className="report-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>System</th>
              <th>Module</th>
              <th>Data Element</th>
              <th>Confirmed</th>
              <th>Remarks</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {reportData && reportData.length > 0 ? reportData.map((record) => (
              <tr key={record.id}>
                <td>{record.id}</td>
                <td>{record.system_name || "-"}</td>
                <td>{record.module_name || "-"}</td>
                <td>{record.data_element || "-"}</td>
                <td>{record.is_confirmed ? "Yes" : "No"}</td>
                <td>{record.remarks || "-"}</td>
                <td>{record.created_at ? formatDate(record.created_at) : "-"}</td>
              </tr>
            )) : (
              <tr><td colSpan="7">No data available.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ReportingApp;
