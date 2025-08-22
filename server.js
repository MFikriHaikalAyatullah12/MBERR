const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static('public'));

// Session configuration
app.use(session({
    secret: 'aplikasi-penilaian-guru-sd-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true jika menggunakan HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 jam
    }
}));

// Database setup
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    // Tabel guru
    db.run(`CREATE TABLE IF NOT EXISTS guru (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nama TEXT NOT NULL,
        kelas INTEGER NOT NULL CHECK (kelas >= 1 AND kelas <= 6),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel siswa
    db.run(`CREATE TABLE IF NOT EXISTS siswa (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama TEXT NOT NULL,
        nis TEXT UNIQUE NOT NULL,
        kelas INTEGER NOT NULL CHECK (kelas >= 1 AND kelas <= 6),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabel mata pelajaran
    db.run(`CREATE TABLE IF NOT EXISTS mata_pelajaran (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nama TEXT NOT NULL,
        kelas INTEGER NOT NULL CHECK (kelas >= 1 AND kelas <= 6)
    )`);

    // Tabel nilai
    db.run(`CREATE TABLE IF NOT EXISTS nilai (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        siswa_id INTEGER NOT NULL,
        mata_pelajaran_id INTEGER NOT NULL,
        nilai REAL NOT NULL CHECK (nilai >= 0 AND nilai <= 100),
        semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
        tahun_ajaran TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (siswa_id) REFERENCES siswa (id),
        FOREIGN KEY (mata_pelajaran_id) REFERENCES mata_pelajaran (id)
    )`);

    // Insert default mata pelajaran untuk setiap kelas
    const mataPelajaran = [
        'Pendidikan Agama',
        'Bahasa Indonesia', 
        'Matematika',
        'IPA',
        'IPS',
        'Pendidikan Jasmani',
        'Seni Budaya',
        'Bahasa Inggris'
    ];

    for (let kelas = 1; kelas <= 6; kelas++) {
        mataPelajaran.forEach(mapel => {
            db.run(`INSERT OR IGNORE INTO mata_pelajaran (nama, kelas) VALUES (?, ?)`, [mapel, kelas]);
        });
    }
}

// Middleware untuk check authentication
function requireAuth(req, res, next) {
    if (req.session.guru_id) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
}

// Routes

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Register guru
app.post('/api/register', async (req, res) => {
    const { username, password, nama, kelas } = req.body;

    if (!username || !password || !nama || !kelas) {
        return res.status(400).json({ error: 'Semua field harus diisi' });
    }

    if (kelas < 1 || kelas > 6) {
        return res.status(400).json({ error: 'Kelas harus antara 1-6' });
    }

    try {
        // Check if kelas sudah ada guru
        db.get('SELECT id FROM guru WHERE kelas = ?', [kelas], async (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (row) {
                return res.status(400).json({ error: 'Kelas sudah memiliki guru' });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert guru baru
            db.run('INSERT INTO guru (username, password, nama, kelas) VALUES (?, ?, ?, ?)', 
                [username, hashedPassword, nama, kelas], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Username sudah digunakan' });
                    }
                    return res.status(500).json({ error: 'Database error' });
                }
                res.json({ message: 'Registrasi berhasil', guru_id: this.lastID });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Login guru
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username dan password harus diisi' });
    }

    db.get('SELECT * FROM guru WHERE username = ?', [username], async (err, guru) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        if (!guru) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }

        try {
            const validPassword = await bcrypt.compare(password, guru.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Username atau password salah' });
            }

            req.session.guru_id = guru.id;
            req.session.kelas = guru.kelas;
            req.session.nama_guru = guru.nama;

            res.json({ 
                message: 'Login berhasil', 
                guru: { 
                    id: guru.id, 
                    nama: guru.nama, 
                    kelas: guru.kelas 
                } 
            });
        } catch (error) {
            res.status(500).json({ error: 'Server error' });
        }
    });
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout error' });
        }
        res.json({ message: 'Logout berhasil' });
    });
});

// Get current user info
app.get('/api/user', requireAuth, (req, res) => {
    db.get('SELECT id, username, nama, kelas FROM guru WHERE id = ?', [req.session.guru_id], (err, guru) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ guru });
    });
});

// Get students by class
app.get('/api/siswa', requireAuth, (req, res) => {
    const kelas = req.session.kelas;
    db.all('SELECT * FROM siswa WHERE kelas = ? ORDER BY nama', [kelas], (err, siswa) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ siswa });
    });
});

// Add student
app.post('/api/siswa', requireAuth, (req, res) => {
    const { nama, nis } = req.body;
    const kelas = req.session.kelas;

    if (!nama || !nis) {
        return res.status(400).json({ error: 'Nama dan NIS harus diisi' });
    }

    db.run('INSERT INTO siswa (nama, nis, kelas) VALUES (?, ?, ?)', [nama, nis, kelas], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'NIS sudah digunakan' });
            }
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'Siswa berhasil ditambahkan', siswa_id: this.lastID });
    });
});

// Update student
app.put('/api/siswa/:id', requireAuth, (req, res) => {
    const { nama, nis } = req.body;
    const siswa_id = req.params.id;
    const kelas = req.session.kelas;

    // Verify siswa belongs to teacher's class
    db.get('SELECT * FROM siswa WHERE id = ? AND kelas = ?', [siswa_id, kelas], (err, siswa) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!siswa) {
            return res.status(404).json({ error: 'Siswa tidak ditemukan' });
        }

        db.run('UPDATE siswa SET nama = ?, nis = ? WHERE id = ?', [nama, nis, siswa_id], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'NIS sudah digunakan' });
                }
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Data siswa berhasil diupdate' });
        });
    });
});

// Delete student
app.delete('/api/siswa/:id', requireAuth, (req, res) => {
    const siswa_id = req.params.id;
    const kelas = req.session.kelas;

    // Verify siswa belongs to teacher's class
    db.get('SELECT * FROM siswa WHERE id = ? AND kelas = ?', [siswa_id, kelas], (err, siswa) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!siswa) {
            return res.status(404).json({ error: 'Siswa tidak ditemukan' });
        }

        // Delete nilai first (foreign key constraint)
        db.run('DELETE FROM nilai WHERE siswa_id = ?', [siswa_id], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            // Then delete siswa
            db.run('DELETE FROM siswa WHERE id = ?', [siswa_id], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }
                res.json({ message: 'Siswa berhasil dihapus' });
            });
        });
    });
});

// Get mata pelajaran by class
app.get('/api/mata-pelajaran', requireAuth, (req, res) => {
    const kelas = req.session.kelas;
    db.all('SELECT * FROM mata_pelajaran WHERE kelas = ? ORDER BY nama', [kelas], (err, mataPelajaran) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ mata_pelajaran: mataPelajaran });
    });
});

// Get nilai by mata pelajaran
app.get('/api/nilai/:mata_pelajaran_id', requireAuth, (req, res) => {
    const mata_pelajaran_id = req.params.mata_pelajaran_id;
    const kelas = req.session.kelas;

    const query = `
        SELECT n.*, s.nama as nama_siswa, s.nis, mp.nama as mata_pelajaran
        FROM nilai n
        JOIN siswa s ON n.siswa_id = s.id
        JOIN mata_pelajaran mp ON n.mata_pelajaran_id = mp.id
        WHERE n.mata_pelajaran_id = ? AND s.kelas = ?
        ORDER BY s.nama
    `;

    db.all(query, [mata_pelajaran_id, kelas], (err, nilai) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ nilai });
    });
});

// Add or update nilai
app.post('/api/nilai', requireAuth, (req, res) => {
    const { siswa_id, mata_pelajaran_id, nilai, semester, tahun_ajaran } = req.body;
    const kelas = req.session.kelas;

    if (!siswa_id || !mata_pelajaran_id || nilai === undefined || !semester || !tahun_ajaran) {
        return res.status(400).json({ error: 'Semua field harus diisi' });
    }

    if (nilai < 0 || nilai > 100) {
        return res.status(400).json({ error: 'Nilai harus antara 0-100' });
    }

    // Verify siswa belongs to teacher's class
    db.get('SELECT * FROM siswa WHERE id = ? AND kelas = ?', [siswa_id, kelas], (err, siswa) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!siswa) {
            return res.status(404).json({ error: 'Siswa tidak ditemukan' });
        }

        // Check if nilai already exists
        db.get('SELECT * FROM nilai WHERE siswa_id = ? AND mata_pelajaran_id = ? AND semester = ? AND tahun_ajaran = ?', 
            [siswa_id, mata_pelajaran_id, semester, tahun_ajaran], (err, existingNilai) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (existingNilai) {
                // Update existing nilai
                db.run('UPDATE nilai SET nilai = ? WHERE id = ?', [nilai, existingNilai.id], (err) => {
                    if (err) {
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json({ message: 'Nilai berhasil diupdate' });
                });
            } else {
                // Insert new nilai
                db.run('INSERT INTO nilai (siswa_id, mata_pelajaran_id, nilai, semester, tahun_ajaran) VALUES (?, ?, ?, ?, ?)', 
                    [siswa_id, mata_pelajaran_id, nilai, semester, tahun_ajaran], function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json({ message: 'Nilai berhasil ditambahkan', nilai_id: this.lastID });
                });
            }
        });
    });
});

// Export nilai to Excel
app.get('/api/export/:mata_pelajaran_id', requireAuth, (req, res) => {
    const mata_pelajaran_id = req.params.mata_pelajaran_id;
    const kelas = req.session.kelas;

    const query = `
        SELECT s.nama, s.nis, n.nilai, n.semester, n.tahun_ajaran, mp.nama as mata_pelajaran
        FROM siswa s
        LEFT JOIN nilai n ON s.id = n.siswa_id AND n.mata_pelajaran_id = ?
        LEFT JOIN mata_pelajaran mp ON n.mata_pelajaran_id = mp.id
        WHERE s.kelas = ?
        ORDER BY s.nama
    `;

    db.all(query, [mata_pelajaran_id, kelas], (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }

        // Create Excel workbook
        const ws = XLSX.utils.json_to_sheet(data.map(row => ({
            'Nama Siswa': row.nama,
            'NIS': row.nis,
            'Mata Pelajaran': row.mata_pelajaran || '',
            'Nilai': row.nilai || '',
            'Semester': row.semester || '',
            'Tahun Ajaran': row.tahun_ajaran || ''
        })));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Nilai Siswa');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename=nilai-siswa.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Database connection closed.');
        process.exit(0);
    });
});
