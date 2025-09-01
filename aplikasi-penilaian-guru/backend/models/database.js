const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Use environment variable for database path
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database/school_grades.db');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`Created database directory: ${dbDir}`);
}

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log(`Connected to SQLite database: ${dbPath}`);
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // Tabel Users (Guru)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            class_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (class_id) REFERENCES classes (id)
        )`);

        // Tabel Classes
        db.run(`CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tabel Students
        db.run(`CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            nis TEXT UNIQUE,
            class_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (class_id) REFERENCES classes (id)
        )`);

        // Tabel Subjects (Mata Pelajaran)
        db.run(`CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            class_id INTEGER,
            is_custom BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (class_id) REFERENCES classes (id)
        )`);

        // Tabel Tasks (Tugas)
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            subject_id INTEGER NOT NULL,
            class_id INTEGER NOT NULL,
            due_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subject_id) REFERENCES subjects (id),
            FOREIGN KEY (class_id) REFERENCES classes (id)
        )`);

        // Tabel Grades (Nilai)
        db.run(`CREATE TABLE IF NOT EXISTS grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            subject_id INTEGER NOT NULL,
            task_id INTEGER,
            grade_value REAL NOT NULL,
            grade_type TEXT DEFAULT 'task',
            semester INTEGER NOT NULL,
            academic_year TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students (id),
            FOREIGN KEY (subject_id) REFERENCES subjects (id),
            FOREIGN KEY (task_id) REFERENCES tasks (id)
        )`);

        // Tabel Sessions untuk mengganti localStorage
        db.run(`CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT UNIQUE NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        // Tabel User Preferences untuk menyimpan preferensi user
        db.run(`CREATE TABLE IF NOT EXISTS user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            preference_key TEXT NOT NULL,
            preference_value TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, preference_key)
        )`);

        // Insert data kelas default - hanya Kelas 1-6
        db.run(`INSERT OR IGNORE INTO classes (id, name, description) VALUES 
            (1, 'Kelas 1', 'Kelas 1 SD'),
            (2, 'Kelas 2', 'Kelas 2 SD'),
            (3, 'Kelas 3', 'Kelas 3 SD'),
            (4, 'Kelas 4', 'Kelas 4 SD'),
            (5, 'Kelas 5', 'Kelas 5 SD'),
            (6, 'Kelas 6', 'Kelas 6 SD')`);

        // Pastikan semua kelas 1-6 ada
        const requiredClasses = [
            {id: 1, name: 'Kelas 1', description: 'Kelas 1 SD'},
            {id: 2, name: 'Kelas 2', description: 'Kelas 2 SD'},
            {id: 3, name: 'Kelas 3', description: 'Kelas 3 SD'},
            {id: 4, name: 'Kelas 4', description: 'Kelas 4 SD'},
            {id: 5, name: 'Kelas 5', description: 'Kelas 5 SD'},
            {id: 6, name: 'Kelas 6', description: 'Kelas 6 SD'}
        ];

        requiredClasses.forEach(classData => {
            db.run(`INSERT OR REPLACE INTO classes (id, name, description) VALUES (?, ?, ?)`,
                [classData.id, classData.name, classData.description]);
        });

        // Hapus kelas tambahan jika ada
        db.run(`DELETE FROM classes WHERE id > 6`);
        db.run(`DELETE FROM students WHERE class_id > 6`);
        db.run(`DELETE FROM subjects WHERE class_id > 6`);
        db.run(`DELETE FROM tasks WHERE class_id > 6`);
        db.run(`DELETE FROM grades WHERE student_id NOT IN (SELECT id FROM students)`);
        db.run(`DELETE FROM grades WHERE subject_id NOT IN (SELECT id FROM subjects)`);
        db.run(`DELETE FROM grades WHERE task_id IS NOT NULL AND task_id NOT IN (SELECT id FROM tasks)`);

        // Insert mata pelajaran per kelas dengan unique constraint
        // Kelas 1-3 (sama)
        const subjects123 = [
            'Bahasa Indonesia', 'Matematika', 'Pendidikan Pancasila', 
            'Pendidikan Agama Islam', 'Seni', 'Penjas'
        ];
        
        // Kelas 4-6 (sama)
        const subjects456 = [
            'Bahasa Indonesia', 'Matematika', 'Pendidikan Pancasila', 
            'Pendidikan Agama Islam', 'Seni', 'Penjas', 'Bahasa Inggris', 'IPAS'
        ];

        // Insert subjects untuk kelas 1-3
        for (let classId = 1; classId <= 3; classId++) {
            subjects123.forEach((subject, index) => {
                db.run(`INSERT OR REPLACE INTO subjects (name, class_id, is_custom) 
                        SELECT ?, ?, 0 
                        WHERE NOT EXISTS (
                            SELECT 1 FROM subjects 
                            WHERE name = ? AND class_id = ?
                        )`, 
                    [subject, classId, subject, classId]);
            });
        }

        // Insert subjects untuk kelas 4-6
        for (let classId = 4; classId <= 6; classId++) {
            subjects456.forEach((subject, index) => {
                db.run(`INSERT OR REPLACE INTO subjects (name, class_id, is_custom) 
                        SELECT ?, ?, 0 
                        WHERE NOT EXISTS (
                            SELECT 1 FROM subjects 
                            WHERE name = ? AND class_id = ?
                        )`, 
                    [subject, classId, subject, classId]);
            });
        }
    });
}

module.exports = { db, initializeDatabase };
