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
const keyOf = (e) => `${e.name}::${e.group || ""}`;
const [usedElements, setUsedElements] = useState(() => {
  return new Set(confirmedEls.map(el => 
    keyOf({
      name: typeof el === 'string' ? el : el.name,
      group: typeof el === 'string' ? '' : (el.group || '')
    })
  ));
});
// Get user info from localStorage
const userInfo = JSON.parse(localStorage.getItem('user') || '{}');
const userName = userInfo.name || '';
const userPhone = userInfo.phone || '';
const userEmail = userInfo.email || '';
// Keep usedElements in sync with gridRows
useEffect(() => {
  const newUsedSet = new Set(gridRows.map(r => 
    keyOf({ 
      name: r.dataElement, 
      group: r.groupName || '' 
    })
  ));
  setUsedElements(newUsedSet);
}, [gridRows]);

// ⚠️ Live duplicate-name detector — recalculates whenever gridRows change
const duplicateNames = React.useMemo(() => {
  const map = {};
  gridRows.forEach(({ dataElement, groupName = '' }) => {
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
const flattenElements = (arr) => {
  if (!arr || !Array.isArray(arr)) return [];
  return arr.flatMap((e) => {
    if (typeof e === 'string') {
      return [{ name: e, group: '' }];
    } else if (e && e.fields && Array.isArray(e.fields)) {
      return e.fields.map((f) => ({ 
        name: f, 
        group: e.group || '' 
      }));
    }
    return [];
  });
};

const getSelectable = (modName) => {
  // Agency-aware module resolution (userAgency → JPA → direct)
  const moduleDef = findModuleForLookup(systemsData, activeSystem, modName);

  if (!moduleDef?.elements) {
    console.log("No elements found for module:", modName, "under system:", activeSystem);
    return [];
  }

  // No more manual 'ID Rujukan' injection here — systems.json already contains it
  const all = flattenElements(moduleDef.elements);

  console.log("Selectable elements:", all);
  return all;
};

/* --------------------------------------------------------------- */
const findModuleForLookup = (systemsData, activeSystem, modName) => {
  if (!systemsData?.Inbound || !activeSystem || !modName) return null;

  const flow = systemsData.Inbound;
  const userAgency = localStorage.getItem('agency') || 'JPA';

  // Try: userAgency → "JPA" → direct (legacy/no-agency)
  const tryPaths = [
    () => flow[userAgency]?.[activeSystem]?.modules?.[modName],
    () => flow["JPA"]?.[activeSystem]?.modules?.[modName],
    () => flow[activeSystem]?.modules?.[modName],
  ];

  for (const fn of tryPaths) {
    try {
      const hit = fn?.();
      if (hit?.elements) return hit;
    } catch (_) {}
  }
  return null;
};


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
  const currentMod = confirmedModule || formData.module || '';

  if (!currentMod) {
    const apiOptions = ['HantarMaklumatAduan','GetStatusAduan','HantarMaklumatAduanCadangan','GetStatusAduanCadangan'];
    const selectedApi = apiOptions.find(api => api === formData.module);
    if (!selectedApi && !confirmedModule) {
      alert('Sila pilih "Nama API" dahulu sebelum menambah baris.');
      return;
    }
  }

  const moduleForElements = confirmedModule || currentMod;
  setPopupModule(moduleForElements);

  const all = getSelectable(moduleForElements);
  // NEW: filter out already-picked elements
  const filtered = all.filter(e => !usedElements.has(keyOf(e)));

  if (filtered.length === 0) {
    alert('Tiada elemen tersedia untuk ditambah.');
    return;
  }

  setAvailableElements(filtered);
  setPopupVisible(true);
};



const removeGridRow = (index) => {
  const toRemove = gridRows[index];
  const k = keyOf({ name: toRemove.dataElement, group: toRemove.groupName || '' });

  const nextRows = gridRows.filter((_, i) => i !== index);
  setGridRows(nextRows);

  const nextUsed = new Set(usedElements);
  nextUsed.delete(k);
  setUsedElements(nextUsed);

  // If popup is open, refresh available elements
  if (isPopupVisible) {
    const moduleForElements = confirmedModule || formData.module || '';
    const all = getSelectable(moduleForElements);
    const filtered = all.filter(e => !nextUsed.has(keyOf(e)));
    setAvailableElements(filtered);
  }
};

const handleElementSelection = (elementObj) => {
  const elem = typeof elementObj === 'string'
    ? { name: elementObj, group: '' }
    : { name: elementObj.name, group: elementObj.group || '' };

  const newRow = {
    dataElement: elem.name,
    groupName: elem.group,
    nama: '', jenis: '', saiz: '', nullable: '', rules: ''
  };

  // insert after last occurrence of same element (nice grouping)
  const nextRows = [...gridRows];
// Better approach
let insertAt = nextRows.length; // default to end
for (let i = nextRows.length - 1; i >= 0; i--) {
  if (nextRows[i].dataElement === elem.name) {
    insertAt = i + 1;
    break;
  }
}
  nextRows.splice(insertAt, 0, newRow);
  setGridRows(nextRows);

  // NEW: mark as used
  const k = keyOf(elem);
  const nextUsed = new Set(usedElements);
  nextUsed.add(k);
  setUsedElements(nextUsed);

  // NEW: deplete popup list; only close when empty
  const nextAvail = availableElements.filter(a => keyOf(typeof a === 'string' ? { name: a, group: '' } : a) !== k);
  setAvailableElements(nextAvail);
  if (nextAvail.length === 0) setPopupVisible(false);
};


useEffect(() => {
  const userAgency = localStorage.getItem('agency') || 'JPA';
  const inboundModules = 
    systemsData?.Inbound?.[userAgency]?.[activeSystem]?.modules ||
    systemsData?.Inbound?.JPA?.[activeSystem]?.modules ||
    systemsData?.Inbound?.[activeSystem]?.modules || {};
  const moduleNames = Object.keys(inboundModules);
  setFormData(prev => ({ ...prev, system: activeSystem }));
  setModules(moduleNames);
}, [activeSystem]);

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
        form.append('pic_name', userName);
        form.append('pic_phone', userPhone);
        form.append('pic_email', userEmail);

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
        timeout: 60000, // 60 second timeout
      }
    );

    console.log('✅ Server response:', response.data);
    
    // Success - show alert and navigate
    window.alert("Borang pengumpulan keperluan berjaya dihantar.");
    
    // Clear form data
    setFormData({});
    setFiles({});
    setGridRows([]); // Also clear grid rows
    setUsedElements(new Set());
    setPopupVisible(false);
    setAvailableElements([]);

    
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
      <h4 className="popup-header">Tambah Baris – Data Element</h4>

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
              const displayName = element.group
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
