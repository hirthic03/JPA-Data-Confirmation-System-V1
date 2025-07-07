import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { saveConfirmed } from './utils/confirmedStore';
import { useNavigate } from 'react-router-dom'; 

// Debug helper – logs appear only in development builds
const dbg = (...args) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args);
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
  const showNotConfirmButton = false; // 🔒 Client-requested: hidden for now, re-enable if needed
  const allowOutboundFlow = false; // 🔒 Hide outbound for now; re-enable if client requests
  const allowedSystems = {
  Outbound: ['Sistem Pengurusan Meja Bantuan (SPMB)'],
  Inbound: ['Sistem Pengurusan Meja Bantuan (SPMB)']
};

 
  const navigate = useNavigate();

  useEffect(() => {
    // 🔄 Try backend first
    axios.get('https://jpa-data-confirmation-system-v1.onrender.com/systems')
      .then(res => {
        setSystemsData(res.data);
        const flows = Object.keys(res.data).filter(flow => allowOutboundFlow || flow === 'Inbound');
        if (!flows.length) {
  dbg('Backend returned no valid flows – keeping existing state');
  return; // stop here; avoid setting empty flowType
}
        setFlowType(flows[0]);
      })
      .catch(() => {
        // 🔁 Fallback to public/systems.json
        fetch('/systems.json')
          .then(res => res.json())
          .then(data => {
  setSystemsData(data);
  const flows = Object.keys(data)                 // grab both flows in file
    .filter(flow => allowOutboundFlow || flow === 'Inbound'); // keep only Inbound
  setFlowType(flows[0]);
})

          .catch(err => console.error("❌ Failed to load systems.json:", err));
      });
  }, []);

useEffect(() => {
  if (!systemsData[flowType]) return;
  const sysList = Object.keys(systemsData[flowType])
    .filter(sys => allowedSystems[flowType]?.includes(sys));
  if (!sysList.includes(system)) {
    setSystem(sysList[0] || '');
  }
}, [flowType, systemsData, system]);


useEffect(() => {
  if (!system || !systemsData[flowType]?.[system]) return;
   dbg(
   "🔍 Available modules for",
   system,
   "→",
   Object.keys(systemsData[flowType][system] || {})
 );
  const moduleEntries = Object.entries(systemsData[flowType][system]);

// Remove invisible whitespace from module names
const filteredModules = moduleEntries.map(([modName]) => modName.trim());

setAvailableModules(filteredModules);

// Ensure selected module is valid
if (!filteredModules.includes(module.trim())) {
  setModule('');
}
}, [system, flowType, systemsData]);

useEffect(() => {
  if (!module) return;
  const normalizedModules = Object.entries(systemsData?.[flowType]?.[system] || {});
  const selectedModule = normalizedModules.find(([name]) => name.trim() === module.trim());
  const modData = selectedModule?.[1]?.elements || [];
 dbg("🧪 module:", module);
 dbg("🧪 elements:", modData);
  setAvailableElements(modData);
  setElements(prev =>
    prev.filter(e => {
      const name = typeof e === 'string' ? e : e.name;
      return modData.includes(name);
    })
  );
}, [module, system, flowType, systemsData]);


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
  if (newElementInput.trim()) {
    alert('Anda masih ada teks di ruangan "Tambah Elemen Data". ' +
          'Sila tekan butang ➕ untuk menambah elemen tersebut dahulu.');
    return;
  }
  if (remarkInput) {
    alert("Sila tambah catatan terlebih dahulu.");
    return;
  }
  if (!elements || elements.length === 0) {
    alert("Sila pilih sekurang-kurangnya satu elemen data.");
    return;
  }

const payload = {
  flowType,
  system,
  module,
  elements: flowType === 'Outbound'
    ? flattenOutboundElements(confirmed)
    : elements.map(({ name, group, confirmed }) => ({ name, group, confirmed })),
  // Only Outbound still sends remarks
  ...(flowType === 'Outbound' && { remarks: remarks.join('; ') })
};


  axios.post('https://jpa-data-confirmation-system-v1.onrender.com/submit', payload)
  
    .then(() => {
      dbg("✅ Submitted payload:", payload);
       if (flowType === 'Inbound') {
      const confirmedNames = payload.elements.map(e => e.name);
      saveConfirmed(system, module, confirmedNames);
      navigate('/requirement');
    }
      alert('Telah dihantar!');
      setElements([]);
     if (flowType === 'Outbound') {
        setRemarks([]);
        setRemarkInput('');
      }
    }).catch(err => {
      console.error('Submission failed:', err);
      alert('Something went wrong while submitting.');
    });
};


  return (
    <div className="confirmation-section">
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
  {Object.keys(systemsData[flowType] || {})
    .filter(sys => allowedSystems[flowType]?.includes(sys))
    .map(sys => (
      <option key={sys}>{sys}</option>
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
    /* 1️⃣  Append “ID Rujukan” once per group, but don’t duplicate */
    const displayFields = item.fields.includes('ID Rujukan')
      ? item.fields
      : [...item.fields, 'ID Rujukan'];

    /* 2️⃣  Render each field – group + name makes it UNIQUE */
    return (
      <div key={idx} className="group">
        <h4>{item.group}</h4>

        {displayFields.map((field, i) => (
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
      <h3>Tambah "{pendingElementLabel}" ke dalam kumpulan mana?</h3>
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
