const express = require('express');
const { db } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get class info for authenticated teacher
router.get('/my-class', authenticateToken, (req, res) => {
    const classId = req.user.class_id;
    
    db.get('SELECT * FROM classes WHERE id = ?', [classId], (err, classInfo) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!classInfo) {
            return res.status(404).json({ error: 'Class not found' });
        }
        
        res.json(classInfo);
    });
});

// Get students count for teacher's class
router.get('/my-class/stats', authenticateToken, (req, res) => {
    const classId = req.user.class_id;
    
    db.get('SELECT COUNT(*) as student_count FROM students WHERE class_id = ?', 
        [classId], (err, result) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            res.json({ student_count: result.student_count });
        });
});

module.exports = router;
