import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { saveConfirmed } from './utils/confirmedStore';
import { useNavigate } from 'react-router-dom'; 

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
 console.log("🔍 Available modules for", system, "→", Object.keys(systemsData[flowType][system]));
  const moduleEntries = Object.entries(systemsData[flowType][system]);

// Remove invisible whitespace from module names
const filteredModules = moduleEntries.map(([modName]) => modName.trim());

setAvailableModules(filteredModules);

// Ensure selected module is valid
const trimmedModule = module.trim();
if (!filteredModules.some(m => m.trim() === trimmedModule)) {
  setModule(filteredModules[0] || '');
}

}, [system, flowType, systemsData]);



useEffect(() => {
  if (!module) return;
  const normalizedModules = Object.entries(systemsData?.[flowType]?.[system] || {});
  const selectedModule = normalizedModules.find(([name]) => name.trim() === module.trim());
  const modData = selectedModule?.[1]?.elements || [];
  console.log("🧪 module:", module);
  console.log("🧪 elements:", modData);
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


  const handleSelect = (value) => {
    if (flowType === 'Outbound') {
      setElements(prev => prev.includes(value) ? prev.filter(el => el !== value) : [...prev, value]);
    } else {
      setElements(prev => {
        const exist = prev.find(el => el.name === value);
        return exist
          ? prev.filter(el => el.name !== value)
          : [...prev, { name: value, confirmed: true }];
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

  // simple confirm-dialog; replace with a custom modal if you prefer
  if (!window.confirm(`Tambah "${label}" ke dalam modul ini?`)) return;

  // Append to list (avoids duplicates)
  setAvailableElements(prev =>
    prev.includes(label) ? prev : [...prev, label]
  );

  // Tick it automatically for Inbound
  setElements(prev => {
    const exists = prev.find(e => e.name === label);
    return exists ? prev : [...prev, { name: label, confirmed: true }];
  });

  setNewElementInput('');   // clear the textbox
};

const submit = (confirmed) => {
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
    : elements.map(e => ({ name: e.name, confirmed })),
  // Only Outbound still sends remarks
  ...(flowType === 'Outbound' && { remarks: remarks.join('; ') })
};


  axios.post('https://jpa-data-confirmation-system-v1.onrender.com/submit', payload)
  
    .then(() => {
      console.log("✅ Submitted payload:", payload);
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
    if (typeof item === 'object' && item.group && Array.isArray(item.fields)) {
      return (
        <div key={idx} className="group">
          <h4>{item.group}</h4>
          {item.fields.map((field, i) => (
            <div key={i} className="checkbox-item">
              <input
                type="checkbox"
                checked={
                  flowType === 'Inbound'
                    ? elements.some(e => e.name === field)
                    : elements.includes(field)
                }
                onChange={() => handleSelect(field)}
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
        <div key={idx} className="checkbox-item">
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
    </div>
  );
}
