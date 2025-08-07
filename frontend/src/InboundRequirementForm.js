import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import systemsData from './systems.json'; // adjust path if needed
import { useNavigate } from 'react-router-dom';
import { loadConfirmed } from './utils/confirmedStore';

export default function InboundRequirementForm() {
  const navigate = useNavigate();
  const {
    system: confirmedSystem,
    module: confirmedModule,
    elements: confirmedEls = []
  } = loadConfirmed();

  const handleLogout = () => {
  localStorage.clear();
  navigate('/login');
};

const DEFAULT_SYSTEM = "Sistem Pengurusan Meja Bantuan (SPMB)";
const activeSystem   = confirmedSystem || DEFAULT_SYSTEM; 

  // 🚧 Kick users back if they haven’t confirmed data elements first
  useEffect(() => {
    if (!confirmedEls.length) {
      alert('Sila sahkan Data Elements di halaman sebelumnya dahulu.');
      navigate('/');          // the route with <SubmissionApp/>
    }
  }, [confirmedEls, navigate]);
  const handleClearExample = (id) => {
  if (id === 'dataInvolved') {
    setFormData(prev => ({
      ...prev,
      [id]: emptyDataTable
    }));
  } else {
    setFormData(prev => ({
      ...prev,
      [id]: ''
    }));
  }
};

  const [formData, setFormData] = useState({});
  const [files, setFiles] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [modules, setModules] = useState([]);
const [gridRows, setGridRows] = useState(
  confirmedEls.map(el => ({
    dataElement: typeof el === 'string' ? el : el.name,
    groupName:   typeof el === 'string' ? '' : el.group,  // ⭐ add this line
    nama: '',
    jenis: '',
    saiz: '',
    nullable: '',
    rules: ''
  }))
);
// ⚠️ Live duplicate-name detector — recalculates whenever gridRows change
const duplicateNames = React.useMemo(() => {
  const map = {};
  gridRows.forEach(({ dataElement, groupName = '__ungrouped__' }) => {
    if (!map[dataElement]) map[dataElement] = new Set();
    map[dataElement].add(groupName);
  });
  // keep only names that appear in ≥ 2 distinct groups
  return Object.keys(map).filter((name) => map[name].size > 1);
}, [gridRows]);

const [isPopupVisible, setPopupVisible] = useState(false);
const [availableElements, setAvailableElements] = useState([]);

/* ---------- Popup helper state & utils (NEW) ------------------- */
const [popupModule, setPopupModule] = useState(confirmedModule || '');

/*  flattenElements()  → converts grouped/flat     */
/*  getSelectable()    → returns only NOT-yet-picked */
const flattenElements = (arr) =>
  arr.flatMap((e) =>
    typeof e === 'string'
      ? [{ name: e, group: '__ungrouped__' }]
      : e.fields.map((f) => ({ name: f, group: e.group }))
  );

const getSelectable = (modName) => {
  // Get all elements for the module from systemsData
  const moduleData = systemsData?.Inbound?.[activeSystem]?.[modName];
  
  if (!moduleData || !moduleData.elements) {
    console.log('No elements found for module:', modName);
    console.log('Looking in:', systemsData?.Inbound?.[activeSystem]);
    return [];
  }

  console.log('Module data found:', moduleData);
  
  // Process the elements to ensure ID Rujukan is always included
  const processedElements = moduleData.elements.map((item) => {
    if (typeof item === "object" && item.group && Array.isArray(item.fields)) {
      // Ensure ID Rujukan is in the fields
      const fields = item.fields.includes("ID Rujukan")
        ? item.fields
        : [...item.fields, "ID Rujukan"];
      return { ...item, fields };
    }
    return item;
  });

  // Flatten all elements - return ALL available elements
  // Don't filter based on what's already in gridRows since we want to allow duplicates
  const allElements = flattenElements(processedElements);
  
  console.log('All available elements for selection:', allElements);
  return allElements;
};
/* --------------------------------------------------------------- */


const handleGridChange = (index, key, value) => {
  const updatedRows = [...gridRows];
  updatedRows[index][key] = value;
  setGridRows(updatedRows);
};

const getCurrentModule = () => {
  if (confirmedModule) return confirmedModule;
  return (formData.module || '').trim();
};


const addGridRow = () => {
  // Get the current module - prioritize confirmedModule
  const currentMod = confirmedModule || formData.module || '';
  
  if (!currentMod || currentMod === '') {
    // Check if we're using one of the API options
    const apiOptions = ['HantarMaklumatAduan', 'GetStatusAduan', 'HantarMaklumatAduanCadangan', 'GetStatusAduanCadangan'];
    const selectedApi = apiOptions.find(api => api === formData.module);
    
    if (!selectedApi && !confirmedModule) {
      alert('Sila pilih "Nama API" dahulu sebelum menambah baris.');
      return;
    }
  }

  // Use the confirmed module for getting elements since that's what has the data
  const moduleForElements = confirmedModule || currentMod;
  
  console.log('Adding row for module:', moduleForElements);
  console.log('System:', activeSystem);
  console.log('SystemsData available:', systemsData);
  
  // Set the module and get available elements
  setPopupModule(moduleForElements);
  const selectableElements = getSelectable(moduleForElements);
  
  if (selectableElements.length === 0) {
    console.error('No elements found. Checking systemsData structure...');
    console.log('Flow: Inbound');
    console.log('System:', activeSystem);
    console.log('Module:', moduleForElements);
    alert('Tidak dapat memuatkan elemen untuk modul ini. Sila pastikan data modul tersedia.');
    return;
  }
  
  setAvailableElements(selectableElements);
  setPopupVisible(true);
};


const removeGridRow = (index) => {
  const updatedRows = gridRows.filter((_, i) => i !== index);
  setGridRows(updatedRows);
};

const handleElementSelection = (elementObj) => {
  console.log('Selected element:', elementObj);
  
  const elementName = typeof elementObj === 'string' ? elementObj : elementObj.name;
  const elementGroup = typeof elementObj === 'string' ? '__ungrouped__' : (elementObj.group || '__ungrouped__');
  
  // Create new row with the selected element
  const newRow = {
    dataElement: elementName,
    groupName: elementGroup === '__ungrouped__' ? '' : elementGroup,
    nama: '',
    jenis: '',
    saiz: '',
    nullable: '',
    rules: ''
  };

  // Find the best position to insert (group similar elements together)
  let insertAt = gridRows.length;
  
  // Try to find the last occurrence of the same element name
  for (let i = gridRows.length - 1; i >= 0; i--) {
    if (gridRows[i].dataElement === elementName) {
      insertAt = i + 1;
      break;
    }
  }

  // Insert the new row
  const newRows = [...gridRows];
  newRows.splice(insertAt, 0, newRow);
  setGridRows(newRows);
  
  // Don't remove the element from available list - allow multiple selections
  // Just close the popup
  setPopupVisible(false);
  
  // Optional: Show a success message
  console.log(`Added new row for: ${elementName}${elementGroup !== '__ungrouped__' ? ` (${elementGroup})` : ''}`);
};


useEffect(() => {
  const inboundModules = systemsData?.Inbound?.[activeSystem] || {};
  const moduleNames    = Object.keys(inboundModules);
  setFormData(prev => ({ ...prev, system: activeSystem }));
  setModules(moduleNames);
}, [activeSystem]); // Added activeSystem dependency

useEffect(() => {
  const handleClickOutside = () => {
    setFormData(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(k => {
        if (k.startsWith('showTooltip_')) updated[k] = false;
      });
      return updated;
    });
  };

  document.addEventListener('click', handleClickOutside);
  return () => document.removeEventListener('click', handleClickOutside);
}, []);


  const questions = [
  {
    id: 'integrationMethod',
    label: '1. Kaedah Integrasi',
    tooltip: 'Pilih kaedah pertukaran data antara sistem seperti API, SFTP, dll.',
    type: 'dropdown',
    options: ['REST API', 'SOAP (WSDL)', 'MYGDX', 'SFTP', 'MQ', 'Direct DB', 'Others']
  },
  {
    id: 'messageFormat',
    label: '2. Format Mesej',
    tooltip: 'Format fail atau mesej yang digunakan semasa penghantaran data.',
    type: 'dropdown',
    options: ['JSON', 'XML', 'CSV', 'XLSX', 'TXT (Fixed Width)', 'Others']
  },
  {
    id: 'transactionType',
    label: '3. Jenis Transaksi',
    tooltip: 'Jenis urus niaga pertukaran data seperti Batch atau Real-time.',
    type: 'dropdown',
    options: ['Batch', 'Real-time', 'Push', 'Pull', 'Streaming', 'Others']
  },
  {
    id: 'frequency',
    label: '4. Frekuensi',
    tooltip: 'Kekerapan penghantaran data.',
    type: 'dropdown',
    options: ['Real-time', 'On Demand', 'Harian', 'Mingguan', 'Bulanan', 'Others']
  },
  {
    id: 'url',
    label: '5. URL Web Services',
    tooltip: 'Alamat endpoint API/web service yang digunakan (jika ada).',
    type: 'text'
  },
  {
    id: 'request',
    label: '6. Request',
    tooltip: 'Contoh atau struktur mesej permintaan daripada sistem anda.',
    type: 'text'
  },
  {
    id: 'response',
    label: '7. Respond (Optional)',
    tooltip: 'Contoh atau struktur mesej jawapan dari sistem anda.',
    type: 'text'
  },
  {
    id: 'remarks',
    label: '8. Remarks',
    tooltip: 'Sebarang catatan tambahan mengenai proses integrasi.',
    type: 'text'
  },
  {
    id: 'dataInvolved',
    label: '9. Data yang Terlibat',
    tooltip: 'Senarai medan data dan struktur yang terlibat dalam integrasi ini.',
    type: 'grid'
  }
];

  const handleChange = (id, value) => {
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleFileChange = (id, file) => {
    setFiles(prev => ({ ...prev, [id]: file }));
  };
/* -----------------------------------------------------------
   🔹 Helper – return real API name
----------------------------------------------------------- */
const getApiValue = () =>
  formData.module === 'Others'
    ? (formData.module_other || '').trim()
    : formData.module;

  const handleSubmit = async () => {
  try {
    console.log('🔵 Starting submission process...');
    console.log('Current formData:', formData);
    console.log('Current gridRows:', gridRows);

    const form = new FormData();

    // Validate all fields before submission
    const missingFields = questions.filter((q) => {
      const value = formData[q.id];

      if (q.id === 'response') return false; // Optional field

      if (q.id === 'dataInvolved') {
        // Check if all grid rows are empty
        const allRowsEmpty = gridRows.every(
          row =>
            !row.nama.trim() &&
            !row.jenis.trim() &&
            !row.saiz.trim() &&
            !row.nullable.trim() &&
            !row.rules.trim()
        );
        return allRowsEmpty;
      }

      if (q.type === 'dropdown') {
        return !value || (value === 'Others' && !formData[`${q.id}_other`]);
      }
      if (q.type === 'text') {
        return !value || value.trim() === '';
      }
      if (q.type === 'file') {
        return !files[q.id];
      }

      return false;
    });

    // Check API value
    const apiValue = getApiValue();
    if (!apiValue) {
      window.alert("Sila pilih API Name – jika 'Others', sila isikan kotak di bawahnya.");
      return;
    }

    // Grid row check for Q9
    const isGridEmpty = gridRows.every(row =>
      !row.nama.trim() && !row.jenis.trim() && !row.saiz.trim() && 
      !row.nullable.trim() && !row.rules.trim()
    );

    if (isGridEmpty) {
      alert("Sila lengkapkan medan berikut: 9. Data yang Terlibat");
      return;
    }

    if (missingFields.length > 0) {
      const firstMissing = missingFields[0].label || "Maklumat wajib";
      window.alert(`Sila lengkapkan medan berikut: ${firstMissing}`);
      return;
    }

    console.log('✅ Validation passed');

    // Prepare structured data - SKIP dataInvolved as it's handled separately
    questions.forEach((q) => {
      // Skip dataInvolved - it will be sent as dataGrid
      if (q.id === 'dataInvolved') {
        return;
      }

      if (q.type === 'dropdown') {
        const selected = formData[q.id];
        if (selected === 'Others') {
          form.append(q.id, formData[`${q.id}_other`] || '');
        } else {
          form.append(q.id, selected || '');
        }
      } else if (q.type === 'text') {
        form.append(q.id, formData[q.id] || '');
      } else if (q.type === 'file') {
        if (files[q.id]) {
          form.append(q.id, files[q.id]);
        }
      }
    });

    // Use activeSystem which is defined at the top of your component
    const systemValue = activeSystem || 'Sistem Pengurusan Meja Bantuan (SPMB)';
    
    // Add system and module selections
    form.append('system', systemValue);
    form.append('api', apiValue);
    form.append('module_group', confirmedModule || '');
    form.append('module', apiValue);
    
    // Add grid data
    form.append('dataGrid', JSON.stringify(gridRows));
    
    // Create submission ID with proper system value
    form.append('submission_id', `${systemValue}-${apiValue}`);
    
    // Only add integrationMethod if not already added from questions loop
    if (!form.has('integrationMethod')) {
      form.append('integrationMethod', 'REST API');
    }

    // Log what we're sending
    console.log('📤 Sending form data:');
    for (let [key, value] of form.entries()) {
      console.log(`  ${key}:`, value);
    }

    setIsSubmitting(true);

    // Make the API request
    const response = await axios.post(
      'https://jpa-data-confirmation-system-v1.onrender.com/submit-inbound',
      form,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // 30 second timeout
      }
    );

    console.log('✅ Server response:', response.data);
    
    // Success - show alert and navigate
    window.alert("Borang pengumpulan keperluan berjaya dihantar.");
    
    // Clear form data
    setFormData({});
    setFiles({});
    setGridRows([]); // Also clear grid rows
    
    // Navigate to submission page
    navigate('/submission');

  } catch (err) {
    console.error('❌ Submission error:', err);
    
    // Detailed error handling
    if (err.response) {
      // Server responded with error
      console.error('Server error response:', err.response.data);
      console.error('Server error status:', err.response.status);
      
      if (err.response.data?.message) {
        alert(`Server error: ${err.response.data.message}`);
      } else if (err.response.status === 400) {
        alert("Bad request: Please check all form fields are filled correctly.");
      } else if (err.response.status === 500) {
        alert("Server error: The server encountered an error. Please try again later.");
      } else {
        alert(`Server error (${err.response.status}): ${err.response.statusText}`);
      }
    } else if (err.request) {
      // Request made but no response
      console.error('No response from server:', err.request);
      alert("Cannot connect to server. Please check your internet connection or try again later.");
    } else {
      // Other errors
      console.error('Error details:', err.message);
      alert(`Error: ${err.message}`);
    }
  } finally {
    setIsSubmitting(false);
  }
};
const calculateProgress = () => {
  let filledCount = 0;
  let totalCount = questions.length;

  questions.forEach(q => {
    const value = formData[q.id];
    if (q.type === 'file') {
      if (files[q.id]) filledCount++;
    } else if (value && value !== '') {
      filledCount++;
    }
  });

  return Math.round((filledCount / totalCount) * 100);
};
const exampleValues = {
  url: "https://api.niise.gov.my/pegawai/info",
  request: 'GET /pegawai?id=123\nAuthorization: Bearer {token}',
  response: '{ "status": 200, "pegawai": { "id": "123", "nama": "Ali" } }',
  remarks: "Contoh: Sistem memerlukan token header untuk akses.",
   dataInvolved: `
| Nama Field                     | Jenis   | Saiz | Nullable | Rules            |
|------------------------------- |---------|------|----------|------------------|
| Id                             | int     | -    | N        | Newid            |
| Nama                           | varchar | 150  | N        |                  |
| NoKadPengenalan                | int     | 12   | N        |                  |
| TarikhLahir                    | varchar | 500  | N        |                  |
| Jantina                        | varchar | 500  | N        |                  |
| PengesahanStatusPenjawatAwam   | varchar | 50   | N        |                  |
| TarikhMulaCuti                 | date    | -    | N        | Format dd/mm/yyyy|
| TarikhAkhirCuti                | date    | -    | N        | Format dd/mm/yyyy|
| BakiCuti                       | int     | 50   | N        |                  |
| JenisCuti                      | varchar | 150  | N        |                  |
| Jabatan/TempatBertugas         | varchar | 150  | N        |                  |
`
};

const emptyDataTable = `
| Nama Field                     | Jenis   | Saiz | Nullable | Rules            |
|--------------------------------|---------|------|----------|------------------|
|                                |         |      |          |                  |
|                                |         |      |          |                  |
|                                |         |      |          |                  |
|                                |         |      |          |                  |
|                                |         |      |          |                  |
`;


const handleUseExample = (id) => {
  setFormData(prev => ({
    ...prev,
    [id]: exampleValues[id] || ''
  }));
};

  return (
    <div className="container">
      {/* Add logout button here - properly placed */}
      <button onClick={handleLogout} style={{ float: 'right', margin: '10px' }}>
        🚪 Log Keluar
      </button>
      <div className="progress-container">
        {/* === Popup for choosing a data element ==================== */}
{isPopupVisible && (
  <div className="popup-overlay" onClick={(e) => {
    if (e.target.className === 'popup-overlay') {
      setPopupVisible(false);
    }
  }}>
    <div className="popup-box">
      <h4 className="popup-header">Tambah Baris – Pilih Modul & Data Element</h4>

      {/* Module display */}
      <div style={{ marginBottom: 15 }}>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>
          Modul: <span style={{ color: '#0a74ff' }}>{popupModule}</span>
        </p>
        <p style={{ fontSize: '12px', color: '#666' }}>
          Elemen tersedia: {availableElements.length} elemen
        </p>
      </div>

      {/* Element list */}
      <div className="popup-elements" style={{ 
        marginTop: '12px',
        maxHeight: '300px',
        overflowY: 'auto',
        border: '1px solid #ddd',
        borderRadius: '4px',
        padding: '10px'
      }}>
        {availableElements.length === 0 ? (
          <p style={{ fontStyle: 'italic', textAlign: 'center', color: '#999' }}>
            Semua elemen bagi modul ini sudah ditambah.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {availableElements.map((element, idx) => {
              const displayName = element.group && element.group !== '__ungrouped__' 
                ? `${element.name} (${element.group})` 
                : element.name;
              
              return (
                <button
                  key={`${element.name}_${element.group}_${idx}`}
                  className="popup-option"
                  onClick={() => handleElementSelection(element)}
                  style={{
                    padding: '10px 15px',
                    textAlign: 'left',
                    background: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    ':hover': {
                      background: '#e9ecef',
                      borderColor: '#adb5bd'
                    }
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#e9ecef';
                    e.target.style.borderColor = '#adb5bd';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = '#f8f9fa';
                    e.target.style.borderColor = '#dee2e6';
                  }}
                >
                  {displayName}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div style={{ 
        marginTop: '15px', 
        display: 'flex', 
        justifyContent: 'flex-end',
        gap: '10px'
      }}>
        <button
          onClick={() => setPopupVisible(false)}
          className="close-btn"
          style={{
            padding: '8px 20px',
            background: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ❌ Tutup
        </button>
      </div>
    </div>
  </div>
)}
{/* === End popup ============================================ */}

  <div className="progress-label">Kemajuan Borang: {calculateProgress()}%</div>
  <div className="progress-bar">
    <div
      className="progress-fill"
      style={{ width: `${calculateProgress()}%` }}
    ></div>
  </div>
</div>



      <h2 className="inbound-title">📋 Pengumpulan Keperluan (Inbound)</h2>
{/* System Name Field */}
<div className="question-block">
  <label className="question-label">Nama Sistem</label>
  <input
    type="text"
    value={confirmedSystem || 'Sistem Pengurusan Meja Bantuan (SPMB)'}
    readOnly
  />
</div>

{/* Module Name Field (read-only preview) */}
<div className="question-block">
  <label className="question-label">Nama Modul</label>
  <input
    type="text"
    value={confirmedModule || formData.module || ''}
    placeholder="Belum dipilih"
    readOnly
  />
</div>

{/* API Name Field */}
<div className="question-block">
  <label className="question-label">Nama API</label>
  <select
    value={formData.module || confirmedModule || ''}
  onChange={(e) => {
    const val = e.target.value;
    handleChange('module', val);
    if (val !== 'Others') handleChange('module_other', ''); // reset
  }}
>
    <option value="">-- Pilih API --</option>
    <option value="HantarMaklumatAduan">HantarMaklumatAduan</option>
    <option value="GetStatusAduan">GetStatusAduan</option>
    <option value="HantarMaklumatAduanCadangan">HantarMaklumatAduanCadangan</option>
    <option value="GetStatusAduanCadangan">GetStatusAduanCadangan</option>
    <option value="Others">Others</option>
  </select>

  {formData.module === 'Others' && (
    <textarea
      rows={3}
      placeholder="Sila nyatakan Nama API lain..."
      value={formData.module_other || ''}
      onChange={(e) => handleChange('module_other', e.target.value)}
      style={{ marginTop: '10px' }}
    />
  )}
</div>


{/* Loop for the 10 Questions */}

      {/* Loop for Questions */}
{questions.map((q) => (
  <div key={q.id} className="question-block">
   <label className="question-label">
  {q.label}
  {(() => {
    const isActive = formData[`showTooltip_${q.id}`];

    const handleTooltipToggle = () => {
      setFormData(prev => ({
        ...prev,
        [`showTooltip_${q.id}`]: !prev[`showTooltip_${q.id}`]
      }));
    };

    const hideTooltip = () => {
      setFormData(prev => ({
        ...prev,
        [`showTooltip_${q.id}`]: false
      }));
    };

    return (
      <div
        className="tooltip-wrapper"
        onMouseEnter={() => {
          if (!isActive) handleTooltipToggle();
        }}
        onMouseLeave={() => {
          if (!isActive) hideTooltip();
        }}
        onClick={(e) => {
          e.stopPropagation(); // prevents global hide
          handleTooltipToggle();
        }}
      >
        <span className="info-icon">i</span>
        {isActive && <div className="tooltip-box">{q.tooltip}</div>}
      </div>
    );
  })()}
</label>


    {q.type === 'dropdown' && (
      <>
        <select
          value={formData[q.id] || ''}
          onChange={(e) => handleChange(q.id, e.target.value)}
        >
          <option value="">-- Pilih --</option>
          {q.options.map((opt, idx) => (
            <option key={idx} value={opt}>{opt}</option>
          ))}
        </select>
        {formData[q.id] === 'Others' && (
          <textarea
            rows={3}
            placeholder="Sila nyatakan pilihan lain..."
            value={formData[`${q.id}_other`] || ''}
            onChange={(e) => handleChange(`${q.id}_other`, e.target.value)}
            style={{ marginTop: '10px' }}
          />
        )}
      </>
    )}

    {q.type === 'text' && (
  <>
    <textarea
      rows={4}
      value={formData[q.id] || ''}
      onChange={(e) => handleChange(q.id, e.target.value)}
      placeholder={q.placeholder || 'Sila jawab di sini...'}
    />
    {['url', 'request', 'response', 'remarks'].includes(q.id) && (
      <button
        type="button"
        className="use-example-btn"
        onClick={() => handleUseExample(q.id)}
      >
        📋 Gunakan Contoh
      </button>
    )}
  </>
)}

    {q.id === 'dataInvolved' && (
  <>
    <table className="grid-table">
      <thead>
        <tr>
          <th>Data Elements</th>
          <th>Nama Field</th>
          <th>Jenis</th>
          <th>Saiz</th>
          <th>Nullable</th>
          <th>Rules</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
    {gridRows.map((row, index) => (
      <tr key={index}>

{/* ✅ 1. Data Elements (read-only + group tag + duplicate icon) */}
<td>
  <div style={{ display: 'flex', alignItems: 'center' }}>
    <input
      value={
        row.groupName         // ← we store the group when gridRows is built
          ? `${row.dataElement} (${row.groupName})`
          : row.dataElement
      }
      readOnly
      style={{ background: '#f5f5f5' }}
    />
    {duplicateNames.includes(row.dataElement) && (
      <span
        title="Elemen ini digunakan dalam lebih daripada satu kumpulan"
        style={{
          color: 'red',
          marginLeft: '6px',
          fontWeight: 'bold',
          cursor: 'help'
        }}
      >
        ⚠️
      </span>
    )}
  </div>
</td>

  {/* ✅ 2. Nama Field (editable) */}
  <td>
    <input
      value={row.nama}
      onChange={(e) => handleGridChange(index, 'nama', e.target.value)}
      placeholder="Contoh: Nama / No Kad Pengenalan"
    />
  </td>
  <td>
    <input
      value={row.jenis}
      onChange={(e) => handleGridChange(index, 'jenis', e.target.value)}
      placeholder="Contoh: varchar / int"
    />
  </td>
  <td>
    <input
      value={row.saiz}
      onChange={(e) => handleGridChange(index, 'saiz', e.target.value)}
      placeholder="Contoh: 150"
    />
  </td>
  <td>
    <input
      value={row.nullable}
      onChange={(e) => handleGridChange(index, 'nullable', e.target.value)}
      placeholder="Contoh: Y / N"
    />
  </td>
  <td>
    <input
      value={row.rules}
      onChange={(e) => handleGridChange(index, 'rules', e.target.value)}
      placeholder="Contoh: Newid / Format dd/mm/yyyy"
    />
  </td>

  {/* ✅ 7. Delete row */}
  <td>
    <button onClick={() => removeGridRow(index)}>❌</button>
  </td>
</tr>

        ))}
      </tbody>
    </table>
    <button type="button" onClick={addGridRow} style={{ marginTop: '10px' }}>
      ➕ Tambah Baris
    </button>
    
{/* 
    <p style={{ fontStyle: 'italic', color: '#888', marginTop: '10px' }}>
      Anda boleh senaraikan struktur data di atas atau muat naik fail jika lebih mudah.
    </p>

    
<label style={{ display: 'block', marginTop: '10px' }}>Muat naik fail sokongan (PDF/Excel):</label>
<input
  type="file"
  accept=".pdf,.doc,.docx,.xlsx,.xls"
  onChange={(e) => handleFileChange(q.id, e.target.files[0])}
/> 
*/}
  </>
)}


  </div>
))}


      <div className="button-group" style={{ marginTop: '30px' }}>
        <button onClick={handleSubmit} disabled={isSubmitting}>Hantar</button>
      </div>
    </div>
  );
}
