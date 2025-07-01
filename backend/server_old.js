
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const systemsData = JSON.parse(fs.readFileSync('./data/systems.json', 'utf-8'));

// GET /systems
app.get('/systems', (req, res) => {
  res.json(Object.keys(systemsData));
});

// GET /modules?system=TERAS
app.get('/modules', (req, res) => {
  const system = req.query.system;
  if (!system || !systemsData[system]) {
    return res.status(400).json({ error: 'Invalid system name' });
  }
  res.json(Object.keys(systemsData[system]));
});

// GET /elements?system=TERAS&module=TTB
app.get('/elements', (req, res) => {
  const { system, module } = req.query;
  if (!system || !module || !systemsData[system] || !systemsData[system][module]) {
    return res.status(400).json({ error: 'Invalid system or module name' });
  }
  res.json({
    title: systemsData[system][module].title,
    elements: systemsData[system][module].elements
  });
});

// POST /submit
app.post('/submit', (req, res) => {
  const { system, module, elements, remarks } = req.body;
  console.log('Received submission:', {
    system,
    module,
    elements,
    remarks,
    timestamp: new Date().toISOString()
  });
  res.json({ message: 'Data submitted successfully!' });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
