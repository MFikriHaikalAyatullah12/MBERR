const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../models/database');

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

// Get available classes - show all classes regardless of assignment
router.get('/classes', (req, res) => {
    db.all(`SELECT id, name, description FROM classes ORDER BY id`,
        (err, classes) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(classes);
        });
});

module.exports = router;
