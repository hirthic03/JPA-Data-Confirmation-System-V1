import React, { useState, useEffect } from 'react';
import './App.css';
import { saveConfirmed } from './utils/confirmedStore';
import { useNavigate } from 'react-router-dom'; 
import api from './utils/api';

// Debug helper – logs appear only in development builds
const dbg = (...args) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args);
};

const rawAgency = localStorage.getItem('agency')?.toLowerCase();

const findMatchingAgencyKey = (systemsData, flowType) => {
    const userAgency = localStorage.getItem('agency');
    if (!userAgency || !systemsData?.[flowType]) return '';
    
    const agencies = Object.keys(systemsData[flowType]);
    
    // 1. Exact match (case-sensitive)
    if (agencies.includes(userAgency)) {
      return userAgency;
    }
    
    // 2. Case-insensitive exact match
    const caseInsensitiveMatch = agencies.find(
      key => key.toLowerCase() === userAgency.toLowerCase()
    );
    if (caseInsensitiveMatch) return caseInsensitiveMatch;
    
    // 3. Partial match (contains)
    const partialMatch = agencies.find(key => {
      const keyLower = key.toLowerCase();
      const userLower = userAgency.toLowerCase();
      return keyLower.includes(userLower) || userLower.includes(keyLower);
    });
    
    return partialMatch || '';
  };


export default function SubmissionApp() {
  const [systemsData, setSystemsData] = useState({});
  
  const [flowType, setFlowType] = useState('Inbound');
  const [system, setSystem] = useState('');
  const [module, setModule] = useState('');
  const [availableModules, setAvailableModules] = useState([]);
  const [availableElements, setAvailableElements] = useState([]);
  const [elements, setElements] = useState([]);
  const [remarkInput, setRemarkInput] = useState('');
  const [newElementInput, setNewElementInput] = useState('');
  const [remarks, setRemarks] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
const [pendingElementLabel, setPendingElementLabel] = useState('');
const [availableGroups, setAvailableGroups] = useState([]);
const [userAgency, setUserAgency] = useState('');

  const showNotConfirmButton = false; // 🔒 Client-requested: hidden for now, re-enable if needed
  const allowOutboundFlow = false; // 🔒 Hide outbound for now; re-enable if client requests
 
  const navigate = useNavigate();
 const handleLogout = () => {
  // Clear localStorage and sessionStorage
  localStorage.clear();
  sessionStorage.clear();

  // Reload the app to its original state
  window.location.href = '/';
};
useEffect(() => {
    // Check authentication before anything else
    const token = localStorage.getItem('token');
    const agency = localStorage.getItem('agency');
    
    if (!token || !agency) {
      console.error('No authentication found');
      navigate('/login');
      return;
    }
    
    // Validate token is not expired
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 < Date.now()) {
        console.error('Token expired');
        localStorage.clear();
        navigate('/login');
        return;
      }
    } catch (e) {
      console.error('Invalid token');
      localStorage.clear();
      navigate('/login');
      return;
    }
  }, [navigate]);

  useEffect(() => {
  /* 1️⃣  Wake Render so the first real call never 502s */
  api.get('/').catch(() => {});

  /* 2️⃣  Now load systems, retry up to 3× if container still cold */
  function loadSystems(attempt = 1) {
  api
    .get('/systems')
    .then(res => {
      setSystemsData(res.data);
      const flows = Object.keys(res.data).filter(
        f => allowOutboundFlow || f === 'Inbound'
      );
      if (flows.length > 0) {
        const flow = flows[0];
        setFlowType(flow);

        const agencyKey = findMatchingAgencyKey(res.data, flow);
            if (!agencyKey) {
              console.warn('❌ No matching agency found for user');
              alert('Agensi anda tidak dijumpai dalam sistem. Sila hubungi pentadbir.');
              navigate('/login');
              return;
            }
            setUserAgency(agencyKey);

        const systems = Object.keys(res.data[flow]?.[agencyKey] || {});
if (systems.length > 0) {
  setSystem(prevSystem => systems.includes(prevSystem) ? prevSystem : systems[0]);

  const selectedSystem = systems.includes(system) ? system : systems[0];
  const modules = Object.keys(
    res.data[flow][agencyKey][selectedSystem]?.modules || {}
  );
  if (modules.length > 0) {
    setModule(prevModule => modules.includes(prevModule) ? prevModule : modules[0]);
  }
}


      }
    })
    .catch(err => {
      if (attempt < 3) {
        setTimeout(() => loadSystems(attempt + 1), 2000);
      } else {
        console.warn('⚠️ Backend unreachable, using local systems.json', err);
        fetch('/systems.json')
          .then(r => r.json())
          .then(data => {
            setSystemsData(data);
            const flows = Object.keys(data).filter(
              f => allowOutboundFlow || f === 'Inbound'
            );
            if (flows.length > 0) {
              const flow = flows[0];
              setFlowType(flow);

              const agencyKey = findMatchingAgencyKey(data, flow);
                  if (!agencyKey) {
                    console.warn('❌ No matching agency found in local data');
                    alert('Agensi anda tidak dijumpai dalam sistem. Sila hubungi pentadbir.');
                    navigate('/login');
                    return;
                  }
                  setUserAgency(agencyKey);

              const systems = Object.keys(data[flow]?.[agencyKey] || {});
              const firstSystem = systems[0];

              if (
                firstSystem &&
                data[flow][agencyKey][firstSystem]?.modules
              ) {
                setSystem(firstSystem);
                const modules = Object.keys(
                  data[flow][agencyKey][firstSystem].modules || {}
                );
                if (modules.length > 0) {
                  setModule(modules[0]);
                }
              }
            }
          })
          .catch(e => {
            console.error('❌ Failed to load local systems.json:', e);
            alert(
              'Gagal memuatkan data sistem. Sila semak sambungan anda dan cuba semula.'
            );
          });
      }
    });
}



  loadSystems();
}, []);


useEffect(() => {
  if (!systemsData[flowType]?.[userAgency]) return;
  const systemList = Object.keys(systemsData[flowType][userAgency]);
  if (!systemList.includes(system)) {
    setSystem(systemList[0] || '');
  }
}, [flowType, systemsData, system, userAgency]);


useEffect(() => {
  if (!system || !systemsData[flowType]?.[userAgency]?.[system]) return;

  const moduleEntries = Object.entries(
    systemsData[flowType][userAgency][system]?.modules || {}
  );

  const filteredModules = moduleEntries.map(([modName]) => modName.trim());

  setAvailableModules(filteredModules);

  if (!filteredModules.includes(module.trim())) {
  setModule(filteredModules[0] || '');
}
}, [system, flowType, systemsData, userAgency]);


useEffect(() => {
  if (!module || !systemsData[flowType]?.[userAgency]?.[system]?.modules) return;

  const normalizedModules = Object.entries(
    systemsData[flowType][userAgency][system].modules || {}
  );

  const selectedModule = normalizedModules.find(
    ([name]) => name.trim() === module.trim()
  );

  const modData = selectedModule?.[1]?.elements || [];

  dbg("🧪 module:", module);
  dbg("🧪 elements:", modData);

  setAvailableElements(modData);

  setElements(prev =>
    prev.filter(e => {
      if (typeof e === 'string') return modData.includes(e);
      return modData.some(
        it =>
          typeof it === 'object' &&
          it.group === e.group &&
          it.fields?.includes(e.name)
      );
    })
  );
}, [module, system, flowType, systemsData, userAgency]);

const flattenOutboundElements = (confirmed) => {
  if (!availableElements || availableElements.length === 0) return [];

  if (typeof availableElements[0] === 'object' && availableElements[0].group) {
    return availableElements.flatMap(group =>
      group.fields.filter(field => elements.includes(field))
                  .map(name => ({ name, confirmed }))
    );
  } else {
    return elements.map(name => ({ name, confirmed }));
  }
};


/**
 * Toggle a checkbox.
 * @param {string} value  – the field label (e.g. "Status Aduan")
 * @param {string} group  – section/group name; defaults to "__ungrouped__"
 */
const handleSelect = (value, group = '__ungrouped__') => {
  if (flowType === 'Outbound') {
    // 🔄 Outbound: still store simple strings
    setElements(prev =>
      prev.includes(value)
        ? prev.filter(el => el !== value)
        : [...prev, value]
    );
  } else {
    // ✅ Inbound: use { name, group } so identical labels in different
    //             groups are treated independently.
    setElements(prev => {
      const exists = prev.find(
        el => el.name === value && el.group === group
      );

      return exists
        ? prev.filter(
            el => !(el.name === value && el.group === group)
          )
        : [
            ...prev,
            {
              name: value,
              group,        // keep track of which section this comes from
              confirmed: true
            }
          ];
    });
  }
};


  const addRemark = () => {
    if (remarkInput.trim()) {
      setRemarks(prev => [...prev, remarkInput.trim()]);
      setRemarkInput('');
    }
  };
// --- NEW ---
const addDataElement = () => {
  const label = newElementInput.trim();
  if (!label) return;

  const groups = (availableElements || [])
    .filter(e => typeof e === 'object' && e.group && Array.isArray(e.fields))
    .map(e => e.group);

  if (groups.length === 0) {
    alert("Tiada kumpulan yang tersedia untuk menambah elemen.");
    return;
  }

  setPendingElementLabel(label);
  setAvailableGroups(groups);
  setShowGroupModal(true);
};

const confirmAddToGroup = (group) => {
  const label = pendingElementLabel;

  setAvailableElements(prev => {
    return prev.map(item => {
      if (typeof item === 'object' && item.group === group && Array.isArray(item.fields)) {
        return {
          ...item,
          fields: item.fields.includes(label)
            ? item.fields
            : [...item.fields, label]
        };
      }
      return item;
    });
  });

  setElements(prev => {
    const exists = prev.find(e => e.name === label && e.group === group);
    return exists
      ? prev
      : [...prev, { name: label, group, confirmed: true }];
  });

  setNewElementInput('');
  setShowGroupModal(false);
  setPendingElementLabel('');
};

const submit = (confirmed) => {
    if (!system || !module) {
      alert('Sila pilih Sistem dan Modul sebelum hantar.');
      return;
    }
  const token = localStorage.getItem('token');
    if (!token) {
      alert('Sesi anda telah tamat. Sila log masuk semula.');
      navigate('/login');
      return;
    }
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  if (newElementInput.trim()) {
    alert('Anda masih ada teks di ruangan "Tambah Elemen Data"...');
    return;
  }

  if (flowType === 'Outbound' && remarkInput) {
    alert("Sila tambah catatan terlebih dahulu.");
    return;
  }

  if (!elements || elements.length === 0) {
    alert("Sila pilih sekurang-kurangnya satu elemen data.");
    return;
  }
  const endpoint =
    flowType === 'Inbound'
      ? '/submit-inbound'
      : '/submit';

  if (flowType === 'Inbound') {
    const fd = new FormData();
    fd.append('system', system);
    fd.append('api', module);
    fd.append('module', module);

    const dataGrid = elements.map(({ name, group }) => ({
      dataElement: name,
      groupName: group || ''
    }));
    fd.append('dataGrid', JSON.stringify(dataGrid));

    api.post(endpoint, fd, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...authHeader
      }
    })
    .then(onSuccess)
    .catch(onError);
  } else {
      api.post(endpoint, {
      flowType,
      system,
      module,
      elements: flattenOutboundElements(confirmed),
      remarks: remarks.join('; ')
    }, {
      headers: {
        ...authHeader
      }
    })
    .then(onSuccess)
    .catch(onError);
  }

  function onSuccess() {
  dbg('✅ Submitted payload');
  alert('Telah dihantar!'); // ✅ Show alert first

  if (flowType === 'Inbound') {
    const confirmedFull = elements.map(({ name, group }) => ({
      name,
      group
    }));
    saveConfirmed(system, module, confirmedFull);
    navigate('/requirement'); // ✅ Navigate after alert
  }

  setElements([]);
  if (flowType === 'Outbound') {
    setRemarks([]);
    setRemarkInput('');
  }
}

  function onError(err) {
      console.error('❌ Submission failed:', err);
      
      // Better error handling
      if (err.response?.status === 401) {
        alert('Sesi anda telah tamat. Sila log masuk semula.');
        localStorage.clear();
        navigate('/login');
      } else if (err.response?.status === 403) {
        alert('Anda tidak mempunyai kebenaran untuk tindakan ini.');
      } else {
        const errorMsg = err.response?.data?.error || err.message || 'Ralat tidak diketahui';
        alert(`Ralat semasa menghantar: ${errorMsg}`);
      }
    }
};



  return (
    <div className="confirmation-section">
      <div style={{ textAlign: 'right', marginBottom: '10px' }}>
  <button onClick={handleLogout} className="logout-btn">Log Keluar</button>
</div>
      <h1 className="nav-title">Pengesahan Data JPA</h1>
      <div className="form-group">
        <label>Aliran Data:</label>
        <select value={flowType} onChange={e => setFlowType(e.target.value)}>
  {Object.keys(systemsData)
    .filter(flow => allowOutboundFlow || flow === 'Inbound') // ⛔ show only Inbound
    .map(flow => (
      <option key={flow}>{flow}</option>
    ))}
</select>

      </div>

      <div className="form-group">
  <label>Nama Sistem:</label>
  <select value={system} onChange={e => setSystem(e.target.value)}>
    {(systemsData[flowType]?.[userAgency]
      ? Object.keys(systemsData[flowType][userAgency])
      : []
    ).map((systemName) => (
      <option key={systemName} value={systemName}>
        {systemName}
      </option>
    ))}
  </select>
</div>


      <div className="form-group">
        <label>Nama Modul:</label>
        <select value={module} onChange={e => setModule(e.target.value)}>
  <option value="">-- Pilih Modul --</option>
  {availableModules.map(mod => (
    <option key={mod} value={mod}>{mod}</option>
  ))}
</select>
      </div>

      <h3>Elemen Data</h3>
<div className="element-section">
  {Array.isArray(availableElements) && availableElements.map((item, idx) => {
     // ✅ Case 1: Grouped elements (object with group and fields)
  /* ---------- GROUPED ELEMENTS ---------- */
  if (typeof item === 'object' && item.group && Array.isArray(item.fields)) {

    /* 2️⃣  Render each field – group + name makes it UNIQUE */
    return (
      <div key={idx} className="group">
        <h4>{item.group}</h4>

        {item.fields.map((field, i) => (
          <div key={i} className="checkbox-item">
            <input
              type="checkbox"
              checked={
                flowType === 'Inbound'
                  ? elements.some(
                      e => e.name === field && e.group === item.group
                    )
                  : elements.includes(field)
              }
              onChange={() => handleSelect(field, item.group)}
            />
            <label>{field}</label>
          </div>
        ))}
      </div>
    );
  }



    // ✅ Case 2: Flat elements (simple strings)
    if (typeof item === 'string') {
      return (
        <div key={`${item}-${idx}`} className="checkbox-item">
          <input
            type="checkbox"
            checked={
  flowType === 'Inbound'
    ? elements.some(e => e.name === item)
    : elements.includes(item)
}

            onChange={() => handleSelect(item)}
          />
          <label>{item}</label>
        </div>
      );
    }

    // ❌ Case 3: Unrecognized structure — skip rendering
    return null;
  })}
</div>
       
{/* -------- Dynamic bottom input area -------- */}
{flowType === 'Outbound' && (
  <div className="form-group">
    <label>Catatan:</label>
    <div className="remarks-container">
      <input
        type="text"
        value={remarkInput}
        onChange={e => setRemarkInput(e.target.value)}
        placeholder="Tambah catatan..."
        className="remarks-input"
      />
      <button onClick={addRemark} className="add-remark-btn">+</button>
    </div>
    <div className="remarks-list">
      {remarks.map((r, idx) => (
        <div key={idx} className="remark-item">
          <span>{r}</span>
          <button onClick={() => setRemarks(remarks.filter((_, i) => i !== idx))}>
            ❌
          </button>
        </div>
      ))}
    </div>
  </div>
)}

{flowType === 'Inbound' && (
  <div className="form-group">
    <label>Tambah Elemen Data:</label>
    <div className="remarks-container">
      <input
        type="text"
        value={newElementInput}
        onChange={e => setNewElementInput(e.target.value)}
        placeholder="e.g. KPI Score"
        className="remarks-input"
      />
      <button onClick={addDataElement} className="add-remark-btn">+</button>
    </div>
  </div>
)}

      <div className="button-group">
        <button onClick={() => submit(true)}>Sahkan</button>
        {showNotConfirmButton && (
    <button onClick={() => submit(false)}>Tidak Disahkan</button>
  )}
      </div>

      {showGroupModal && (
  <div className="modal-overlay">
    <div className="modal">
      <h3 className="modal-header">
  Tambah <span className="highlight-label">"{pendingElementLabel}"</span> ke dalam kumpulan mana?
</h3>
      {availableGroups.map((group, idx) => (
        <button
          key={idx}
          className="group-select-btn"
          onClick={() => confirmAddToGroup(group)}
        >
          {group}
        </button>
      ))}
      <button onClick={() => setShowGroupModal(false)} className="cancel-btn">
        Batal
      </button>
    </div>
  </div>
)}

    </div>
  );
}
