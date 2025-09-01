const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Use environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-this';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;

// Register
router.post('/register', async (req, res) => {
    try {
        const { username, password, name, class_id } = req.body;

        if (!username || !password || !name || !class_id) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Check if username exists
        db.get('SELECT id FROM users WHERE username = ?', [username], async (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (row) {
                return res.status(400).json({ error: 'Username already exists' });
            }

            // Allow multiple teachers per class - remove class assignment check
            // This allows multiple teachers to be assigned to the same class
            
            // Hash password with environment rounds
            const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

            // Insert user
            db.run('INSERT INTO users (username, password, name, class_id) VALUES (?, ?, ?, ?)',
                [username, hashedPassword, name, class_id],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to create user' });
                    }

                    res.status(201).json({ message: 'User created successfully', userId: this.lastID });
                }
            );
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get current user info
router.get('/me', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        
        db.get('SELECT id, username, name, class_id FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    class_id: user.class_id
                }
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const isValidPassword = await bcrypt.compare(password, user.password);

            if (!isValidPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Generate token with environment expiry
            const token = jwt.sign(
                { userId: user.id, username: user.username, class_id: user.class_id },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            res.json({
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    class_id: user.class_id
                }
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get available classes - hanya tampilkan Kelas 1-6
router.get('/classes', (req, res) => {
    db.all(`SELECT id, name, description FROM classes WHERE id <= 6 ORDER BY id`,
        (err, classes) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(classes);
        });
});

// Get all registered users (for admin purposes)
router.get('/all-users', async (req, res) => {
    try {
        db.all('SELECT id, username, name, class_id FROM users ORDER BY username', (err, users) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(users);
        });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete ALL accounts and reset database (ADMIN ONLY)
router.post('/delete-all-accounts', async (req, res) => {
    try {
        const { adminPassword } = req.body;
        
        // Check admin password
        const expectedPassword = process.env.ADMIN_PASSWORD || 'admin123';
        if (adminPassword !== expectedPassword) {
            return res.status(401).json({ error: 'Invalid admin password' });
        }

        // Start transaction to delete all data
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            try {
                // Delete all data in proper order (to avoid foreign key constraints)
                db.run('DELETE FROM grades');
                db.run('DELETE FROM tasks');
                db.run('DELETE FROM subjects WHERE is_custom = 1'); // Keep default subjects
                db.run('DELETE FROM students');
                db.run('DELETE FROM user_preferences');
                db.run('DELETE FROM sessions');
                db.run('DELETE FROM users');
                
                // Reset sequences
                db.run('DELETE FROM sqlite_sequence WHERE name IN ("users", "students", "tasks", "grades", "user_preferences", "sessions")');

                db.run('COMMIT', (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Failed to delete all accounts' });
                    }
                    res.json({ message: 'All accounts and data deleted successfully' });
                });

            } catch (error) {
                db.run('ROLLBACK');
                res.status(500).json({ error: 'Failed to delete all accounts and data' });
            }
        });
    } catch (error) {
        console.error('Delete all accounts error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete account and all associated data
router.delete('/delete-account', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password is required for account deletion' });
        }

        // Verify user exists and password is correct
        db.get('SELECT * FROM users WHERE id = ?', [userId], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                return res.status(401).json({ error: 'Invalid password' });
            }

            // Start transaction to delete all user data
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                try {
                    // Get user's class_id to delete related data
                    const classId = user.class_id;

                    // Delete grades for students in user's class
                    db.run('DELETE FROM grades WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)', [classId]);
                    
                    // Delete tasks for user's class
                    db.run('DELETE FROM tasks WHERE class_id = ?', [classId]);
                    
                    // Delete subjects for user's class (custom subjects only)
                    db.run('DELETE FROM subjects WHERE class_id = ? AND is_custom = 1', [classId]);
                    
                    // Delete students in user's class
                    db.run('DELETE FROM students WHERE class_id = ?', [classId]);
                    
                    // Delete user preferences
                    db.run('DELETE FROM user_preferences WHERE user_id = ?', [userId]);
                    
                    // Delete user sessions
                    db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
                    
                    // Delete the user account
                    db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to delete account' });
                        }

                        // Delete the class if no other users are assigned to it
                        db.get('SELECT COUNT(*) as count FROM users WHERE class_id = ?', [classId], (err, result) => {
                            if (err || result.count === 0) {
                                db.run('DELETE FROM classes WHERE id = ?', [classId]);
                            }
                            
                            db.run('COMMIT');
                            res.json({ message: 'Account and all associated data deleted successfully' });
                        });
                    });

                } catch (error) {
                    db.run('ROLLBACK');
                    res.status(500).json({ error: 'Failed to delete account and data' });
                }
            });
        });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete all accounts (Admin function)
router.post('/delete-all-accounts', async (req, res) => {
    try {
        const { confirmationPassword } = req.body;

        // Simple password protection for this dangerous operation
        const ADMIN_PASSWORD = process.env.ADMIN_DELETE_PASSWORD || 'DELETE_ALL_ACCOUNTS_2025';
        
        if (!confirmationPassword) {
            return res.status(400).json({ error: 'Password konfirmasi diperlukan' });
        }

        if (confirmationPassword !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Password konfirmasi salah' });
        }

        // Start transaction to delete all data
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            try {
                // Delete all data in correct order (respecting foreign key constraints)
                db.run('DELETE FROM grades', (err) => {
                    if (err) {
                        console.error('Error deleting grades:', err);
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'Gagal menghapus data nilai' });
                    }

                    db.run('DELETE FROM tasks', (err) => {
                        if (err) {
                            console.error('Error deleting tasks:', err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Gagal menghapus data tugas' });
                        }

                        db.run('DELETE FROM students', (err) => {
                            if (err) {
                                console.error('Error deleting students:', err);
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Gagal menghapus data siswa' });
                            }

                            db.run('DELETE FROM subjects WHERE is_custom = 1', (err) => {
                                if (err) {
                                    console.error('Error deleting custom subjects:', err);
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Gagal menghapus mata pelajaran custom' });
                                }

                                db.run('DELETE FROM user_preferences', (err) => {
                                    if (err) {
                                        console.error('Error deleting user preferences:', err);
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: 'Gagal menghapus preferensi user' });
                                    }

                                    db.run('DELETE FROM sessions', (err) => {
                                        if (err) {
                                            console.error('Error deleting sessions:', err);
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ error: 'Gagal menghapus sesi' });
                                        }

                                        db.run('DELETE FROM users', function(err) {
                                            if (err) {
                                                console.error('Error deleting users:', err);
                                                db.run('ROLLBACK');
                                                return res.status(500).json({ error: 'Gagal menghapus akun pengguna' });
                                            }

                                            // Reset auto increment counters
                                            db.run('DELETE FROM sqlite_sequence WHERE name IN ("users", "students", "tasks", "grades", "sessions", "user_preferences")', (err) => {
                                                if (err) {
                                                    console.warn('Warning: Could not reset auto increment counters:', err);
                                                }

                                                db.run('COMMIT');
                                                console.log('All user accounts and associated data deleted successfully');
                                                res.json({ 
                                                    message: 'Semua akun dan data terkait berhasil dihapus',
                                                    deletedAccounts: this.changes || 0
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });

            } catch (error) {
                console.error('Delete all accounts error:', error);
                db.run('ROLLBACK');
                res.status(500).json({ error: 'Terjadi kesalahan saat menghapus data' });
            }
        });
    } catch (error) {
        console.error('Delete all accounts error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
