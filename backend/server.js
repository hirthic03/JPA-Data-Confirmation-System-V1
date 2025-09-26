require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');
const nodemailer = require('nodemailer');
const puppeteer = require('puppeteer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const JWT_SECRET = process.env.JWT_SECRET || 'fallbackSecret123'; // 🔐 Always secure!

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: errors.array()[0].msg 
    });
  }
  next();
};

// 4. Enhanced authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(403).json({ error: 'Invalid token' });
    }

    if (!user.id || !user.agency) {
      return res.status(403).json({ error: 'Invalid token payload' });
    }

    req.user = user;
    next();
  });
}

// Initialize
const app = express();
const saltRounds = 10;

// Add this after line 33 (after const saltRounds = 10;)
const emailQueue = new Map(); // Track email sending status

// ────────────────────────────────────────────────────────────────
// CORS - allow only your Vercel frontend + localhost (dev)
// ────────────────────────────────────────────────────────────────


// ✅ CORS - must come first
// 🟢 Set allowed origins
const allowedOrigins = [
  'https://jpa-data-confirmation-system-v1.vercel.app',
  'https://jpa-data-confirmation-system-v1-git-main-hirthics-projects.vercel.app',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.options('*', cors()); 


// 🟢 Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());

// 🟢 Rate limiting only for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Terlalu banyak cubaan. Sila cuba lagi dalam 15 minit.'
});
app.use('/login', authLimiter);
app.use('/register', authLimiter);

// 🟢 Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🟢 DB initialization
const dbDir = path.join(__dirname, 'data');
fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(__dirname, 'confirmation_data.db'));


db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name   TEXT NOT NULL,
    phone  TEXT NOT NULL,
    email  TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'agency',
    agency TEXT
  )
`).run();
// Add columns if they don't exist (for existing databases)
try {
  db.prepare(`ALTER TABLE users ADD COLUMN name TEXT`).run();
} catch (e) {
  // Column already exists
}
try {
  db.prepare(`ALTER TABLE users ADD COLUMN phone TEXT`).run();
} catch (e) {
  // Column already exists
}
console.log('✅ Users table checked/created');
const upload = multer({ dest: 'uploads/' });
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // use TLS
  auth: {
    user: process.env.NOTIF_EMAIL,
    pass: process.env.NOTIF_PASS
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false
  }
});

const CC_LIST = (process.env.NOTIF_CC || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

  // Email verification with better error handling
transporter.verify((err, success) => {
  if (err) {
    console.error('⚠️ EMAIL CONFIG WARNING:', err.message);
    console.log('Email sending will be disabled');
  } else {
    console.log('✅ Email service ready');
  }
});
  
const PORT = process.env.PORT || 3001;
const SUBMISSIONS_FOLDER = 'inbound_submissions';
if (!fs.existsSync(SUBMISSIONS_FOLDER)) fs.mkdirSync(SUBMISSIONS_FOLDER);

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
db.prepare(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();
// ✅ One-time migration: Add api_name column to inbound_requirements if it doesn't exist
try {
  db.prepare(`ALTER TABLE inbound_requirements ADD COLUMN api_name TEXT`).run();
} catch (e) {
  // Ignore if already exists
}

// ✅ Ensure group_name column exists even on an old DB
const gridCols = db.prepare(`PRAGMA table_info(inbound_data_grid)`).all()
                    .map(c => c.name);
if (!gridCols.includes('group_name')) {
  db.prepare(`ALTER TABLE inbound_data_grid ADD COLUMN group_name TEXT`).run();
  console.log('ℹ️  Added missing group_name column to inbound_data_grid');
}

async function seedUsers() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (existing.count > 0) {
    console.log('⚠️ Users already seeded, skipping.');
    return;
  }

  const testUsers = [
    {
      agency_name: 'Jabatan A',
      email: 'agency1@jpa.gov.my',
      password: 'agency123',
      role: 'agency'
    },
    {
      agency_name: 'Jabatan Digital',
      email: 'admin@jpa.gov.my',
      password: 'admin123',
      role: 'admin'
    }
  ];

  for (const u of testUsers) {
    const hash = await bcrypt.hash(u.password, 10);
db.prepare(`
  INSERT INTO users (email, password, role, agency)
  VALUES (?, ?, ?, ?)
`).run(u.email, hash, u.role, u.agency_name);
    console.log(`✅ Created user: ${u.email}`);
  }
}
seedUsers();

// Utility
function getQuestionTextById(id) {
  const questionMap = {
    'integrationMethod': '1. Kaedah Integrasi',
    'messageFormat': '2. Format Mesej',
    'transactionType': '3. Jenis Transaksi',
    'frequency': '4. Frekuensi',
    'url': '5. URL Web Services',
    'request': '6. Request',
    'response': '7. Respond (Optional)',
    'remarks': '8. Remarks',
    'dataInvolved': '9. Data yang Terlibat'
  };
  return questionMap[id] || null; // Return null instead of id for unknown questions
}


/** ------------------------------------------------------------------
 * buildInboundEmail – returns nicely-formatted HTML for the mail body
 * -----------------------------------------------------------------*/

function buildInboundEmail(reqBody, gridRows, meta, picInfo) {
  const q = (id) => reqBody[id] || '-';
  const picSection = `
    <h3>👤 Maklumat PIC (Person In Charge)</h3>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width: 100%;">
      <tbody>
        <tr><td><b>Nama</b></td><td>${picInfo.name || '-'}</td></tr>
        <tr><td><b>No. Telefon</b></td><td>${picInfo.phone || '-'}</td></tr>
        <tr><td><b>Email</b></td><td>${picInfo.email || '-'}</td></tr>
        <tr><td><b>Tarikh & Masa Hantar</b></td><td>${meta.created_at}</td></tr>
      </tbody>
    </table>`;
  const qnaSection = `
    <h3>📝 Q&A Summary</h3>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width: 100%;">
      <tbody>
        <tr><td><b>1. Kaedah Integrasi</b></td><td>${q('integrationMethod')}</td></tr>
        <tr><td><b>2. Format Mesej</b></td><td>${q('messageFormat')}</td></tr>
        <tr><td><b>3. Jenis Transaksi</b></td><td>${q('transactionType')}</td></tr>
        <tr><td><b>4. Frekuensi</b></td><td>${q('frequency')}</td></tr>
        <tr><td><b>5. URL</b></td><td><code>${q('url')}</code></td></tr>
        <tr><td><b>6. Request</b></td><td><pre>${q('request')}</pre></td></tr>
        <tr><td><b>7. Response</b></td><td><pre>${q('response')}</pre></td></tr>
        <tr><td><b>8. Remarks</b></td><td>${q('remarks')}</td></tr>
        <tr><td><b>9. Submission ID</b></td><td>${q('submission_id')}</td></tr>
      </tbody>
    </table>`;

  const gridSection = `
    <h3>📊 Data Elements (${gridRows.length})</h3>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width: 100%; font-family: sans-serif;">
      <thead>
        <tr style="background:#f0f0f0">
          <th>#</th>
          <th>Data Element</th>
          <th>Nama Field</th>
          <th>Jenis</th>
          <th>Saiz</th>
          <th>Nullable</th>
          <th>Rules</th>
        </tr>
      </thead>
      <tbody>
        ${gridRows.map((r, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${(r.dataElement || r.data_element) + (r.groupName || r.group_name ? ` (${r.groupName || r.group_name})` : '')}</td>
            <td>${r.nama}</td>
            <td>${r.jenis}</td>
            <td>${r.saiz}</td>
            <td>${r.nullable}</td>
            <td>${r.rules}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  return `
    <div style="font-family: Arial, sans-serif; font-size: 14px;">
      <h2>📥 Inbound Requirement Submission</h2>
      <p><b>System:</b> ${meta.system}</p>
      <p><b>API Name:</b> ${meta.apiName}</p>
      <p><b>Module (Group):</b> ${meta.moduleName}</p>
      <p><b>Submitted At:</b> ${meta.created_at}</p>
      ${picSection}
      ${qnaSection}
      ${gridSection}
    </div>
  `;
}


async function sendEmailWithPDF(pdfBuffer, filename = 'requirement.pdf', htmlBody = '') {
  const mailOptions = {
    from: process.env.NOTIF_EMAIL || process.env.EMAIL_USER,
    to: process.env.EMAIL_TO,
    cc: CC_LIST,
    subject: '📎 Inbound Requirement Submission PDF',
    text: 'Attached is the generated PDF for the inbound requirement submission.',
    html: htmlBody, // ✅ This line makes the email body show up
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }
    ]
  };

  return transporter.sendMail(mailOptions);
}

// Add this BEFORE your existing app.post('/submit-inbound') endpoint (around line 264)
async function sendInboundEmail(reqBody, gridRows, meta, picInfo, submission_uuid) {
  const emailStatus = {
    id: submission_uuid,
    status: 'pending',
    attempts: 0,
    lastError: null,
    timestamp: new Date().toISOString()
  };
  
  emailQueue.set(submission_uuid, emailStatus);
  
  try {
    console.log('📧 Starting email send for submission:', submission_uuid);
    
    // Verify transporter is ready
    await transporter.verify();
    console.log('✅ Email transporter verified');
    
    const htmlBody = buildInboundEmail(reqBody, gridRows, meta, picInfo);
    
    const mailOptions = {
      from: process.env.NOTIF_EMAIL || process.env.EMAIL_USER,
      to: process.env.EMAIL_TO || process.env.NOTIF_EMAIL,
      cc: CC_LIST.filter(Boolean),
      subject: `📋 Inbound Requirement - ${meta.system} - ${meta.apiName}`,
      html: htmlBody,
      headers: {
        'X-Priority': '3',
        'X-Mailer': 'JPA Data Confirmation System'
      }
    };
    
    console.log('📤 Sending email to:', mailOptions.to);
    console.log('📤 CC to:', mailOptions.cc);
    
    const info = await transporter.sendMail(mailOptions);
    
    emailStatus.status = 'sent';
    emailStatus.messageId = info.messageId;
    emailStatus.response = info.response;
    
    console.log('✅ Email sent successfully:', info.messageId);
    console.log('📬 Response:', info.response);
    
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    emailStatus.status = 'failed';
    emailStatus.lastError = error.message;
    emailStatus.attempts++;
    
    console.error('❌ Email send failed:', {
      error: error.message,
      code: error.code,
      command: error.command,
      responseCode: error.responseCode,
      submission: submission_uuid
    });
    
    // Retry logic
    if (emailStatus.attempts < 3) {
      console.log(`🔄 Retrying email send (attempt ${emailStatus.attempts + 1}/3)...`);
      setTimeout(() => {
        sendInboundEmail(reqBody, gridRows, meta, picInfo, submission_uuid);
      }, 5000 * emailStatus.attempts); // Exponential backoff
    }
    
    return { success: false, error: error.message };
  }
}

app.post('/submit-inbound', upload.any(), async (req, res) => {
  console.log('📦 Incoming inbound payload:', JSON.stringify(req.body, null, 2));
  
  try {
    const {
      system,
      api: apiNameRaw,
      module: apiNameOld,
      module_group,
      dataGrid,
      pic_name,
      pic_phone,
      pic_email
    } = req.body;

    const apiName = apiNameRaw || apiNameOld;
    const moduleName = module_group || apiName;
    const submission_uuid = randomUUID();
    const created_at = new Date().toISOString();
    let q9RowId = null;

    if (!system || !apiName) {
      return res.status(400).json({ error: 'System and API are required' });
    }

    // Database operations
    const questionInsert = db.prepare(`
  INSERT INTO inbound_requirements
  (submission_uuid, system_name, module_name, api_name,
  question_id, question_text, answer, file_path, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

    const uploadedFiles = {};
    if (req.files) {
      for (const file of req.files) {
        uploadedFiles[file.fieldname] = file.path;
      }
    }

    let result;
    Object.entries(req.body).forEach(([key, value]) => {
      if (['system', 'api', 'module', 'module_group', 'dataGrid', 'submission_id'].includes(key) || 
          key.startsWith('showTooltip_') ||
          key.endsWith('_other')) {
        return;
      }
      
      const questionText = getQuestionTextById(key);
      if (questionText !== null) {
        const filePath = uploadedFiles[key] || null;
        
        result = questionInsert.run(
          submission_uuid,
          system,
          moduleName,
          apiName || '',
          key,
          questionText,
          value || '',
          filePath,
          created_at
        );

        if (key === 'dataInvolved') {
          q9RowId = result.lastInsertRowid;
        }
      }
    });
    
    // Process grid data
    let cleanedGrid = [];
    if (dataGrid) {
      try {
        const parsedGrid = JSON.parse(dataGrid);
        cleanedGrid = parsedGrid.map(row => ({
          data_element: row.dataElement || '-',
          group_name: row.groupName || '',
          nama: row.nama || '-',
          jenis: row.jenis || '-',
          saiz: row.saiz || '-',
          nullable: row.nullable || '-',
          rules: row.rules || '-'
        }));

        const stmt = db.prepare(`
          INSERT INTO inbound_data_grid
          (submission_uuid, submission_id, nama, jenis, saiz, nullable, rules, data_element, group_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        cleanedGrid.forEach(row => {
          stmt.run(
            submission_uuid,
            q9RowId || null,
            row.nama,
            row.jenis,
            row.saiz,
            row.nullable,
            row.rules,
            row.data_element,
            row.group_name
          );
        });
        
        console.log(`✅ Inserted ${cleanedGrid.length} grid rows`);
      } catch (err) {
        console.error('⚠️ Grid parsing error:', err);
        // Continue without failing the entire submission
      }
    }

    // Send email synchronously but with timeout
    let emailResult = { status: 'not_sent', error: 'Email service not configured' };
    
    if (process.env.NOTIF_EMAIL && process.env.NOTIF_PASS) {
      try {
        // Set a timeout for email sending
        const emailPromise = sendInboundEmail(
          req.body, 
          cleanedGrid, 
          {
            system,
            apiName,
            moduleName,
            created_at
          },
          {
            name: pic_name,
            phone: pic_phone,
            email: pic_email
          },
          submission_uuid
        );
        
        // Wait up to 10 seconds for email
        emailResult = await Promise.race([
          emailPromise,
          new Promise(resolve => setTimeout(() => 
            resolve({ status: 'timeout', error: 'Email sending timed out but will continue in background' }), 
            10000
          ))
        ]);
      } catch (emailError) {
        console.error('Email error:', emailError);
        emailResult = { status: 'failed', error: emailError.message };
      }
    }

    // Always return success for the submission itself
    res.status(200).json({
      message: '✅ Borang berjaya dihantar',
      submission_id: submission_uuid,
      emailStatus: emailResult
    });

  } catch (error) {
    console.error('❌ Submission error:', error);
    return res.status(500).json({ 
      error: 'Ralat sistem. Sila cuba lagi.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.post('/register', async (req, res) => {
  try {
    const { name, phone, email, password, agency, role } = req.body;

    // Validate all fields
    if (!name || !phone || !email || !password || !agency || !role) {
      return res.status(400).json({ 
        success: false, 
        message: 'Semua medan diperlukan' 
      });
    }

    // ✅ Validate input types
    if (typeof email !== 'string' || typeof password !== 'string' || typeof agency !== 'string' || typeof role !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid input type' });
    }

    // ✅ Check if user already exists
    const userExists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
    if (userExists) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email sudah didaftarkan' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const stmt = db.prepare('INSERT INTO users (name, phone, email, password, agency, role) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(name, phone, email, hashedPassword, agency, role);

    console.log(`✅ Created user: ${email} (${name})`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Registration Error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // VALIDATE INPUT
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // QUERY USER
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    // VERIFY PASSWORD
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

    // GENERATE TOKEN
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        role: user.role,
        agency: user.agency,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // RESPOND
    res.json({
      token,
       user: {
    ...user,
    name: user.name  // Make sure name is included
  },
      agency: user.agency || 'JPA' // <-- ✅ Needed for your frontend
    });
  } catch (err) {
    console.error('❌ LOGIN ERROR:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});
// Forgot Password - Request Reset
app.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email diperlukan' 
      });
    }

    // Check if user exists
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    
    if (!user) {
      // Don't reveal if email exists for security
      return res.json({ 
        success: true, 
        message: 'Jika email wujud dalam sistem, arahan tetapan semula akan dihantar.' 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    
    // Delete any existing tokens for this email
    db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
    
    // Save new token
    db.prepare(`
      INSERT INTO password_resets (email, token, expires_at)
      VALUES (?, ?, ?)
    `).run(email, hashedToken, expiresAt);
    
    // Create reset link
    const resetLink = `${process.env.FRONTEND_URL || 'https://jpa-data-confirmation-system-v1.vercel.app'}/reset-password?token=${resetToken}`;
    
    // Send email
    const mailOptions = {
      from: process.env.NOTIF_EMAIL || process.env.EMAIL_USER,
      to: email,
      subject: '🔐 Tetapan Semula Kata Laluan - JPA Data Confirmation System',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #003366;">Tetapan Semula Kata Laluan</h2>
          <p>Salam ${user.name || 'Pengguna'},</p>
          <p>Kami telah menerima permintaan untuk menetapkan semula kata laluan akaun anda.</p>
          <p>Klik butang di bawah untuk menetapkan kata laluan baharu:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" 
               style="background-color: #007bff; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Tetapkan Semula Kata Laluan
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Atau salin dan tampal pautan ini ke pelayar anda:<br>
            <code style="background: #f5f5f5; padding: 5px;">${resetLink}</code>
          </p>
          <hr style="border: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">
            Pautan ini akan tamat tempoh dalam 1 jam.<br>
            Jika anda tidak meminta tetapan semula kata laluan, sila abaikan email ini.
          </p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    console.log(`Password reset email sent to: ${email}`);
    res.json({ 
      success: true, 
      message: 'Arahan tetapan semula telah dihantar ke email anda.' 
    });
    
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Ralat sistem. Sila cuba lagi.' 
    });
  }
});

// Reset Password - Verify Token and Update Password
app.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Token dan kata laluan diperlukan' 
      });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: 'Kata laluan mestilah sekurang-kurangnya 8 aksara' 
      });
    }
    
    // Hash the token to match stored version
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    // Find valid token
    const resetRecord = db.prepare(`
      SELECT * FROM password_resets 
      WHERE token = ? 
      AND expires_at > datetime('now') 
      AND used = 0
    `).get(hashedToken);
    
    if (!resetRecord) {
      return res.status(400).json({ 
        success: false, 
        message: 'Token tidak sah atau telah tamat tempoh' 
      });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Update user password
    db.prepare(`
      UPDATE users 
      SET password = ? 
      WHERE email = ?
    `).run(hashedPassword, resetRecord.email);
    
    // Mark token as used
    db.prepare(`
      UPDATE password_resets 
      SET used = 1 
      WHERE id = ?
    `).run(resetRecord.id);
    
    console.log(`Password reset successful for: ${resetRecord.email}`);
    res.json({ 
      success: true, 
      message: 'Kata laluan berjaya ditetapkan semula. Sila log masuk.' 
    });
    
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Ralat sistem. Sila cuba lagi.' 
    });
  }
});

// Verify Reset Token (to check if token is valid before showing reset form)
app.get('/verify-reset-token/:token', (req, res) => {
  try {
    const { token } = req.params;
    
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const resetRecord = db.prepare(`
      SELECT * FROM password_resets 
      WHERE token = ? 
      AND expires_at > datetime('now') 
      AND used = 0
    `).get(hashedToken);
    
    if (!resetRecord) {
      return res.status(400).json({ 
        success: false, 
        message: 'Token tidak sah atau telah tamat tempoh' 
      });
    }
    
    res.json({ 
      success: true, 
      email: resetRecord.email 
    });
    
  } catch (err) {
    console.error('Verify token error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Ralat sistem' 
    });
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
    // 1. Fetch all question rows
    const questions = db
      .prepare('SELECT * FROM inbound_requirements ORDER BY created_at DESC')
      .all();

    // 2. Attach grid rows (if any) to each question row
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

// Admin endpoint to view all submissions
app.get('/admin-view-submissions', async (req, res) => {
  // Simple password protection
const adminPassword = req.headers['x-admin-password'];
if (adminPassword !== (process.env.ADMIN_VIEW_PASSWORD || 'YourVeryStrongPassword2024!')) {
  return res.status(401).json({ error: 'Unauthorized' });
}
  
  try {
    // Get all submissions with their grid data
    const submissions = db.prepare(`
      SELECT * FROM inbound_requirements 
      ORDER BY created_at DESC 
      LIMIT 50
    `).all();
    
    const gridStmt = db.prepare(
      'SELECT * FROM inbound_data_grid WHERE submission_uuid = ?'
    );
    
    const results = [];
    const processedUUIDs = new Set();
    
    for (const sub of submissions) {
      if (processedUUIDs.has(sub.submission_uuid)) continue;
      processedUUIDs.add(sub.submission_uuid);
      
      const allQuestions = db.prepare(
        'SELECT * FROM inbound_requirements WHERE submission_uuid = ?'
      ).all(sub.submission_uuid);
      
      const gridData = gridStmt.all(sub.submission_uuid);
      
      results.push({
        submission_uuid: sub.submission_uuid,
        system: sub.system_name,
        api: sub.api_name,
        module: sub.module_name,
        created_at: sub.created_at,
        questions: allQuestions.map(q => ({
          question: q.question_text,
          answer: q.answer
        })),
        gridData: gridData
      });
    }
    
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  const systemsPath = path.join(__dirname, 'data', 'systems.json');
  fs.readFile(systemsPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Failed to read systems.json:', err);
      return res.status(500).json({ error: 'Unable to load systems data' });
    }
    try {
      res.json(JSON.parse(data));
    } catch (parseError) {
      console.error('Invalid JSON:', parseError);
      res.status(500).json({ error: 'Invalid systems data' });
    }
  });
});


// ✅ Root status route
app.get('/', (req, res) => {
  res.send('🟢 JPA Data Confirmation Backend is running!');
});

// 🔐 Simple DB export – streams the entire SQLite file
app.get('/export-backup', (req, res) => {
  const dbPath = path.join(__dirname, 'confirmation_data.db');

  // If ever you protect admin with auth, wrap this in auth middleware
  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ error: 'DB file not found' });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=confirmation_backup_${Date.now()}.db`
  );

  fs.createReadStream(dbPath).pipe(res);
});

// Export submissions as CSV
app.get('/export-submissions-csv', (req, res) => {
const adminPassword = req.headers['x-admin-password'];
if (adminPassword !== (process.env.ADMIN_VIEW_PASSWORD || 'YourVeryStrongPassword2024!')) {
  return res.status(401).json({ error: 'Unauthorized' });
}
  
  try {
    const submissions = db.prepare(`
      SELECT 
        ir.submission_uuid,
        ir.system_name,
        ir.api_name,
        ir.question_text,
        ir.answer,
        ir.created_at
      FROM inbound_requirements ir
      ORDER BY ir.created_at DESC
    `).all();
    
    // Create CSV
    let csv = 'Submission ID,System,API,Question,Answer,Date\n';
    
    for (const row of submissions) {
      csv += `"${row.submission_uuid}","${row.system_name}","${row.api_name}","${row.question_text}","${row.answer?.replace(/"/g, '""')}","${row.created_at}"\n`;
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=submissions.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

app.post('/logout', authenticateToken, (req, res) => {
  console.log(`User ${req.user.email} logged out`);
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/agency-data', authenticateToken, (req, res) => {
  const userAgency = req.user.agency;
  const data = getDataForAgency(userAgency);
  res.json(data);
});

const server = app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server...');
  server.close(() => {
    db.close();
    console.log('Server shutdown complete.');
    process.exit(0);
  });
});

// Add these security improvements to your existing server.js

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));


// 7. Add logout endpoint
app.post('/logout', authenticateToken, (req, res) => {
  // In a production system, you might want to blacklist the token
  // For now, just acknowledge the logout
  console.log(`User ${req.user.email} logged out`);
  res.json({ success: true, message: 'Logged out successfully' });
});

function getDataForAgency(agency) {
  // Replace this with real filtered results if needed
  return {
    agency,
    message: 'Agency-specific data would be returned here',
    data: []
  };
}

// 8. Protected route example with agency filtering
app.get('/api/agency-data', authenticateToken, (req, res) => {
  const userAgency = req.user.agency;
  
  // Filter data based on user's agency
  // Example: only return data relevant to user's agency
  const data = getDataForAgency(userAgency);
  
  res.json(data);
});

// Add these NEW endpoints after line 906 (before the existing test endpoints)

// Check email status for a specific submission
app.get('/email-status/:submission_id', (req, res) => {
  const status = emailQueue.get(req.params.submission_id);
  if (!status) {
    return res.status(404).json({ error: 'Submission not found' });
  }
  res.json(status);
});

// Comprehensive email debug endpoint
app.get('/debug-email', async (req, res) => {
  const debugInfo = {
    config: {
      hasEmail: !!process.env.NOTIF_EMAIL,
      hasPassword: !!process.env.NOTIF_PASS,
      emailLength: process.env.NOTIF_EMAIL?.length || 0,
      passwordLength: process.env.NOTIF_PASS?.length || 0,
      emailTo: process.env.EMAIL_TO || 'Not set',
      emailUser: process.env.EMAIL_USER || 'Not set',
      notifCc: process.env.NOTIF_CC || 'Not set'
    },
    queue: Array.from(emailQueue.entries()).map(([id, status]) => ({
      id,
      ...status
    }))
  };

  try {
    await transporter.verify();
    debugInfo.transporterStatus = '✅ Connected and ready';
    debugInfo.canSendEmail = true;
  } catch (error) {
    debugInfo.transporterStatus = '❌ Connection failed';
    debugInfo.transporterError = {
      message: error.message,
      code: error.code,
      command: error.command
    };
    debugInfo.canSendEmail = false;
  }

  res.json(debugInfo);
});

// Test endpoint 1: Check email configuration
app.get('/test-email-config', async (req, res) => {
  const config = {
    email: process.env.NOTIF_EMAIL || 'Not set',
    hasPassword: !!process.env.NOTIF_PASS,
    passwordLength: process.env.NOTIF_PASS ? process.env.NOTIF_PASS.length : 0,
    emailTo: process.env.EMAIL_TO || 'Not set',
    nodeEnv: process.env.NODE_ENV || 'Not set'
  };
  
  try {
    await transporter.verify();
    res.json({ 
      ...config, 
      status: '✅ Email configuration is VALID',
      ready: true 
    });
  } catch (err) {
    res.json({ 
      ...config, 
      status: '❌ Email configuration FAILED',
      error: err.message,
      code: err.code,
      command: err.command,
      ready: false 
    });
  }
});

// Test endpoint 2: Send a test email
app.post('/test-email-send', async (req, res) => {
  try {
    console.log('Starting test email send...');
    console.log('From:', process.env.NOTIF_EMAIL);
    console.log('To:', process.env.EMAIL_TO || process.env.NOTIF_EMAIL);
    
    const info = await transporter.sendMail({
      from: process.env.NOTIF_EMAIL,
      to: process.env.EMAIL_TO || process.env.NOTIF_EMAIL,
      subject: 'Test Email - JPA System',
      text: 'If you receive this, email is working!',
      html: '<h1>Success!</h1><p>Email configuration is working correctly.</p>'
    });
    
    console.log('Email sent successfully:', info);
    res.json({ 
      success: true, 
      messageId: info.messageId,
      accepted: info.accepted,
      response: info.response
    });
  } catch (error) {
    console.error('Email send failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      code: error.code,
      command: error.command,
      responseCode: error.responseCode
    });
  }
});