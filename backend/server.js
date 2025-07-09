const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
//-------------------------------------------------------------
// 🌍  Front-end domains that are allowed to call this backend
//-------------------------------------------------------------
const ALLOWED_ORIGINS = [
  'https://jpa-data-confirmation-system-v1.vercel.app', // production UI
  'http://localhost:3000'                               // dev UI (optional)
];



// Initialize
const app = express();
const db = new Database(path.join(__dirname, 'confirmation_data.db'));
db.pragma('journal_mode = WAL'); // Improves SQLite concurrency + crash safety

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit
}).any();

const PORT = process.env.PORT || 3001;
const SUBMISSIONS_FOLDER = 'inbound_submissions';
if (!fs.existsSync(SUBMISSIONS_FOLDER)) fs.mkdirSync(SUBMISSIONS_FOLDER);

// Middleware
// Middleware

// 🟢 ───────────────────────────── CORS SET-UP ────────────────────────────
const allowedOrigins = [
  'https://jpa-data-confirmation-system-v1.vercel.app',
  'http://localhost:3000'           // local dev
];

const corsOptions = {
  origin(origin, callback) {
    // allow Postman / curl (no Origin header) or any whitelisted domain
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS not allowed for this origin: ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200        // older browsers prefer 200 over 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // pre-flight for every route
// 🟢 ──────────────────────────────────────────────────────────────────────

app.use(helmet()); // 🛡️ Adds security headers
const isProd = process.env.NODE_ENV === 'production';
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 300 : 3000
}));

app.use(express.json({ limit: '1mb' })); // ✅ Re-add JSON parser


app.use('/uploads', express.static('uploads'));

// Table Creation
db.prepare(`
  CREATE TABLE IF NOT EXISTS confirmations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_name TEXT,
    module_name TEXT,
    data_element TEXT,
    is_confirmed INTEGER,
    remarks TEXT,
    created_at TEXT,
    flow_type TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS inbound_requirements (
  submission_uuid TEXT,
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_name TEXT,
    module_name TEXT,
    question_id TEXT,
    question_text TEXT,
    answer TEXT,
    file_path TEXT,
    created_at TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS inbound_data_grid (
  submission_uuid TEXT,
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER,
    nama TEXT,
    jenis TEXT,
    saiz TEXT,
    nullable TEXT,
    rules TEXT,
    data_element TEXT,
    group_name     TEXT,
    FOREIGN KEY(submission_id) REFERENCES inbound_requirements(id)
  )
`).run();
// ✅ One-time migration: Add api_name column to inbound_requirements if it doesn't exist
try {
  db.prepare(`ALTER TABLE inbound_requirements ADD COLUMN api_name TEXT`).run();
} catch (e) {
  // Ignore if already exists
}

// ✅ One-time migration: Add group_name column to inbound_data_grid if it doesn't exist
/*try {
  db.prepare(`ALTER TABLE inbound_data_grid ADD COLUMN group_name TEXT`).run();
} catch (e) {
  // Ignore if already exists
}*/

// Utility
function getQuestionTextById(id) {
  const questionMap = {
    q1: '1. Apakah data yang akan dihantar atau diterima?',
    q2: '2. Seberapa kerap data dikemas kini atau diperlukan?',
    q3: '3. Apakah kaedah integrasi yang disokong?',
    q4: '4. Adakah anda mempunyai dokumentasi API atau WSDL?',
    q5: '5. Apakah logik semakan atau perniagaan sistem anda?',
    q6: '6. Siapakah pegawai teknikal (PIC) untuk ujian integrasi?',
    q7: '7. Adakah terdapat sekatan firewall/IP?',
    q8: '8. Adakah persekitaran UAT tersedia untuk ujian?',
    q9: '9. Apakah masa respons yang dijangka (SLA)?',
    q10: '10. Adakah anda memerlukan log audit, mesej ralat, atau callback?'
  };
  return questionMap[id] || id;
}


// ✅ Inbound Submission Handler (Correct Placement)
// ✅ Inbound Submission Handler (Fixed)
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }
  next(err);
});

/* ──────────────────────────────────────────────────────────
   POST  /submit-inbound
   Saves: ① stub row ➜ ② Q&A rows ➜ ③ grid rows (dataGrid or elements[])
   Transaction-wrapped so it’s all-or-nothing.
────────────────────────────────────────────────────────── */
/* ──────────────────────────────────────────────────────────
   POST  /submit-inbound   (final, with extra safety logs)
────────────────────────────────────────────────────────── */
app.post('/submit-inbound', upload, (req, res) => {
  try {
    // ---------- 1. Debug info -----------
    console.log('🆕 /submit-inbound hit - form keys:', Object.keys(req.body));
    if (req.files?.length) {
      console.log('🆕 Upload files:', req.files.map(f => f.fieldname));
    }

    // ---------- 2.  Pre-parse basic fields ----------
    const {
      system,
      api       : apiNameRaw,     // preferred new field
      module    : apiNameOld,     // legacy field
      module_group,
      dataGrid
    } = req.body;

    const apiName    = apiNameRaw || apiNameOld;
    const moduleName = module_group || apiName;     // fallback

    if (!system || !apiName) {
      return res.status(400).json({ error: 'System and API are required' });
    }

    const submission_uuid = req.body.submission_uuid || randomUUID();
    const created_at      = new Date().toISOString();

    /* ---------- 3.   Run everything inside one transaction ---------- */
    db.transaction(() => {

      /* 3-A  Stub parent row (always) */
      const stubId = db.prepare(`
        INSERT INTO inbound_requirements
          (submission_uuid, system_name, module_name, api_name,
           question_id,  question_text, answer, file_path, created_at)
        VALUES (?, ?, ?, ?, 'confirm', 'Confirmed data elements', '', '', ?)
      `).run(submission_uuid, system, moduleName, apiName, created_at).lastInsertRowid;

      /* 3-B  Q&A rows */
      const questionInsert = db.prepare(`
        INSERT INTO inbound_requirements
          (submission_uuid, system_name, module_name, api_name,
           question_id, question_text, answer, file_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const uploadedFiles = {};
      if (req.files) {
        for (const f of req.files) uploadedFiles[f.fieldname] = f.path;
      }

      let q9RowId = null;

      Object.entries(req.body).forEach(([key, val]) => {
        if (
          [
            'system', 'api', 'module', 'module_group',
            'dataGrid', 'flowType', 'elements', 'submission_uuid'
          ].includes(key)
        ) return;

        const row = questionInsert.run(
          submission_uuid,
          system,
          moduleName,
          apiName,
          key,
          getQuestionTextById(key),
          val,
          uploadedFiles[key] || null,
          created_at
        );

        if (key === 'dataInvolved') q9RowId = row.lastInsertRowid;
      });

      const gridSubmissionId = q9RowId || stubId;

      /* 3-C  Insert grid rows  */
      let gridRows = [];

      if (dataGrid) {
        // Guarantee JSON parse
        try {
          gridRows = typeof dataGrid === 'string' ? JSON.parse(dataGrid) : dataGrid;
        } catch (e) {
          console.error('❌ Invalid dataGrid JSON:', dataGrid);
          throw new Error('Invalid dataGrid JSON');   // handled below
        }
      }

      const gridStmt = db.prepare(`
        INSERT INTO inbound_data_grid
          (submission_uuid, submission_id, nama, jenis, saiz,
           nullable, rules, data_element, group_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      if (Array.isArray(gridRows) && gridRows.length) {
        gridRows.forEach(r => {
          gridStmt.run(
            submission_uuid,
            gridSubmissionId,
            r.nama,
            r.jenis,
            r.saiz,
            r.nullable,
            r.rules,
            r.dataElement || '',
            r.groupName   || ''
          );
        });
      }

      /* 3-D  Legacy elements[] fallback */
      if (!gridRows.length && Array.isArray(req.body.elements) && req.body.elements.length) {
        const elemStmt = db.prepare(`
          INSERT INTO inbound_data_grid
            (submission_uuid, submission_id, data_element, group_name,
             nama, jenis, saiz, nullable, rules)
          VALUES (?, ?, ?, ?, '', '', '', '', '')
        `);

        req.body.elements.forEach(el => {
          elemStmt.run(
            submission_uuid,
            gridSubmissionId,
            el.name || '',
            el.group_name || el.group || '__ungrouped__'
          );
        });
      }

    })(); // commit transaction

    return res.status(200).json({ message: 'Inbound requirement saved.' });

  } catch (err) {
    if (err.message === 'Invalid dataGrid JSON') {
      return res.status(400).json({ error: err.message });
    }
    console.error('🔥 ERROR during /submit-inbound:', err);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});




// 📄 Outbound Submission Handler
app.post('/submit', (req, res) => {
  const { flowType, system, module, elements, remarks } = req.body;
  const timestamp = new Date().toISOString();

  if (!system || !module || !elements || elements.length === 0) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO confirmations
        (system_name, module_name, data_element,
         is_confirmed, remarks, created_at, flow_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const el of elements) {
      const name = typeof el === 'string' ? el : el.name;
      const confirmed =
        typeof el === 'object' && el.hasOwnProperty('confirmed')
          ? (el.confirmed ? 1 : 0)
          : 1;

      stmt.run(system, module, name, confirmed, remarks, timestamp, flowType);
    }

    console.log(`[✅ Outbound Submission] ${elements.length} items for "${system}"`);
    res.status(200).send('Submission saved to database');
  } catch (err) {
    console.error('Database insert error:', err);
    res.status(500).send('Database error');
  }
});
// 📥 Inbound submissions view
app.get('/inbound-submissions', (req, res) => {
  try {
    // 1. fetch all question rows
    const questions = db
      .prepare('SELECT * FROM inbound_requirements ORDER BY created_at DESC')
      .all();

    // 2. attach grid rows (if any) to each question row
    const gridStmt = db.prepare(
      'SELECT * FROM inbound_data_grid WHERE submission_uuid = ?'
    );

    const result = questions.map((row) => {
  const grid = gridStmt.all(row.submission_uuid);
  console.log(`⬇️ Grid data for submission_uuid: ${row.submission_uuid}`);
  console.log(grid);
  return {
    ...row,
    gridData: grid
  };
});


    res.json(result);
  } catch (err) {
    console.error('Inbound fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch inbound submissions' });
  }
});


app.get('/inbound-submissions-grouped', (req, res) => {
  try {
    const requirements = db.prepare(`
      SELECT * FROM inbound_requirements ORDER BY created_at DESC
    `).all();

    const grid = db.prepare(`
      SELECT * FROM inbound_data_grid
    `).all();

    const grouped = {};

    for (const row of requirements) {
      const key = row.submission_uuid;

      if (!grouped[key]) {
        grouped[key] = {
       id: row.id,                // keep first-row id if you still use it in UI
         submission_uuid: key,
          system: row.system_name,
          module: row.module_name,
          api: row.api_name,
          created_at: row.created_at,
          questions: [],
          gridData: []
        };
      }

      grouped[key].questions.push({
        id: row.id,
        question_id: row.question_id,
        question_text: row.question_text,
        answer: row.answer,
        file_path: row.file_path
      });
    }

    // Attach grid rows to their matching submission
  // we’ll also build a quick {group → [fields]} map so the
  // frontend can show “(group name)” beside every data element.
  const groupMaps = {};   // submission_uuid → { groupName: Set<fields> }

  for (const g of grid) {
    const sub = grouped[g.submission_uuid];
    if (!sub) continue;

    // 1️⃣  push raw row to gridData (existing behaviour)
    sub.gridData.push({
      data_element: g.data_element,
      group_name : g.group_name || '',
      nama       : g.nama,
      jenis      : g.jenis,
      saiz       : g.saiz,
      nullable   : g.nullable,
      rules      : g.rules
    });

    // 2️⃣  accumulate into groupMaps
    if (!groupMaps[sub.submission_uuid]) groupMaps[sub.submission_uuid] = {};
    const grp = g.group_name || '__ungrouped__';
    if (!groupMaps[sub.submission_uuid][grp]) groupMaps[sub.submission_uuid][grp] = new Set();
    groupMaps[sub.submission_uuid][grp].add(g.data_element);
  }

  // 3️⃣  convert each map →   elements:[{group,fields[]}]  and attach to object
  for (const [subId, gm] of Object.entries(groupMaps)) {
    grouped[subId].elements = Object.entries(gm).map(([group, set]) => ({
      group,
      fields: [...set]           // convert Set → Array
    }));
  }

    res.json(Object.values(grouped));
  } catch (err) {
    console.error('Grouped fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch grouped submissions' });
  }
});




// 📄 Admin Reporting
app.get('/all-submissions', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM confirmations ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📦 Download + Zip
app.get('/download/:storedName(*)', (req, res) => {
  const relPath = req.params.storedName;
  const filePath = path.join('uploads', relPath);
  const fallbackPath = path.join(SUBMISSIONS_FOLDER, relPath);
  const finalPath = fs.existsSync(filePath) ? filePath : fallbackPath;
  res.download(finalPath);
});

app.get('/generate-submission-folder/:timestamp', async (req, res) => {
  const { timestamp } = req.params;

  const matchDir = fs.readdirSync(SUBMISSIONS_FOLDER).find(dir => {
    const jsonPath = path.join(SUBMISSIONS_FOLDER, dir, 'submission.json');
    if (!fs.existsSync(jsonPath)) return false;
    const content = JSON.parse(fs.readFileSync(jsonPath));
    return content.timestamp === timestamp;
  });

  if (!matchDir) return res.status(404).send('Submission not found');

  const folderPath = path.join(SUBMISSIONS_FOLDER, matchDir);
  const zipPath = path.join(__dirname, `temp-${timestamp}.zip`);

  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    res.download(zipPath, () => fs.unlinkSync(zipPath));
  });

  archive.on('error', err => res.status(500).send({ error: err.message }));
  archive.pipe(output);
  archive.directory(folderPath, false);
  archive.finalize();
});
// ✅ Serve systems.json to frontend
app.get('/systems', (req, res) => {
  const systemsPath = path.join(__dirname, 'data', 'systems.json');
  fs.readFile(systemsPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Failed to read systems.json:', err);
      return res.status(500).json({ error: 'Unable to load systems data' });
    }
    res.json(JSON.parse(data));
  });
});

// ✅ Root status route
app.get('/', (req, res) => {
  res.send('🟢 JPA Data Confirmation Backend is running!');
});

// 🔐 Simple DB export – streams the entire SQLite file
// 🔐 Improved DB Export – creates a safe SQLite backup before streaming
app.get('/export-backup', async (req, res) => {
  try {
    const timestamp = Date.now();
    const snapshotPath = path.join(__dirname, `snapshot_${timestamp}.db`);

    // Use built-in .backup() for atomic file copy
    await db.backup(snapshotPath);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=confirmation_backup_${timestamp}.db`
    );

    const stream = fs.createReadStream(snapshotPath);
    stream.pipe(res);

    // Auto-delete temp file after download finishes
    stream.on('close', () => {
      fs.unlink(snapshotPath, () => {});
    });
  } catch (err) {
    console.error('DB backup failed:', err);
    res.status(500).json({ error: 'Failed to create DB backup' });
  }
});

// ⚠️ TEMP: Delete test/demo data by pattern (https://jpa-data-confirmation-system-v1.onrender.com/cleanup-test-data) but remember to download db first
// 🧹 FULL Cleanup Endpoint – deletes all data in admin and requirement tables
app.delete('/cleanup-test-data', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  const expected = process.env.ADMIN_CLEANUP_SECRET || 'YourSecret123';

  if (secret !== expected) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin secret' });
  }

  try {
    db.prepare(`DELETE FROM inbound_data_grid`).run();
    db.prepare(`DELETE FROM inbound_requirements`).run();
    db.prepare(`DELETE FROM confirmations`).run();
    res.json({ success: true, message: 'ALL data cleared.' });
  } catch (err) {
    console.error('Cleanup failed:', err);
    res.status(500).json({ error: 'Failed to clean up data' });
  }
});

// 🚀 Launch
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
