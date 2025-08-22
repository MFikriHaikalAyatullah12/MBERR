const express = require('express');
const { db } = require('../models/database');
const { authenticateToken, authorizeClass } = require('../middleware/auth');

const router = express.Router();

// Get all students in teacher's class
router.get('/', authenticateToken, (req, res) => {
    const classId = req.user.class_id;
    
    db.all('SELECT * FROM students WHERE class_id = ? ORDER BY name', 
        [classId], (err, students) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json(students);
        });
});

// Add new student
router.post('/', authenticateToken, (req, res) => {
    const { name, nis } = req.body;
    const classId = req.user.class_id;

    if (!name) {
        return res.status(400).json({ error: 'Student name is required' });
    }

    // Check if NIS already exists (if provided)
    if (nis) {
        db.get('SELECT id FROM students WHERE nis = ?', [nis], (err, existingStudent) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (existingStudent) {
                return res.status(400).json({ error: 'NIS already exists' });
            }
            
            insertStudent();
        });
    } else {
        insertStudent();
    }

    function insertStudent() {
        db.run('INSERT INTO students (name, nis, class_id) VALUES (?, ?, ?)',
            [name, nis || null, classId],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Failed to add student' });
                }

                res.status(201).json({ 
                    message: 'Student added successfully', 
                    studentId: this.lastID 
                });
            }
        );
    }
});

// Update student
router.put('/:id', authenticateToken, (req, res) => {
    const studentId = req.params.id;
    const { name, nis } = req.body;
    const classId = req.user.class_id;

    if (!name) {
        return res.status(400).json({ error: 'Student name is required' });
    }

    // Verify student belongs to teacher's class
    db.get('SELECT * FROM students WHERE id = ? AND class_id = ?', 
        [studentId, classId], (err, student) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!student) {
                return res.status(404).json({ error: 'Student not found or access denied' });
            }

            // Check if NIS already exists for other students
            if (nis && nis !== student.nis) {
                db.get('SELECT id FROM students WHERE nis = ? AND id != ?', 
                    [nis, studentId], (err, existingStudent) => {
                        if (err) {
                            return res.status(500).json({ error: 'Database error' });
                        }
                        
                        if (existingStudent) {
                            return res.status(400).json({ error: 'NIS already exists' });
                        }
                        
                        updateStudent();
                    });
            } else {
                updateStudent();
            }

            function updateStudent() {
                db.run('UPDATE students SET name = ?, nis = ? WHERE id = ?',
                    [name, nis || null, studentId],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ error: 'Failed to update student' });
                        }

                        res.json({ message: 'Student updated successfully' });
                    }
                );
            }
        });
});

// Delete student
router.delete('/:id', authenticateToken, (req, res) => {
    const studentId = req.params.id;
    const classId = req.user.class_id;

    // Verify student belongs to teacher's class
    db.get('SELECT * FROM students WHERE id = ? AND class_id = ?', 
        [studentId, classId], (err, student) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!student) {
                return res.status(404).json({ error: 'Student not found or access denied' });
            }

            // Delete student and related grades
            db.serialize(() => {
                db.run('DELETE FROM grades WHERE student_id = ?', [studentId]);
                db.run('DELETE FROM students WHERE id = ?', [studentId], function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to delete student' });
                    }

                    res.json({ message: 'Student deleted successfully' });
                });
            });
        });
});

// Get student details with grades
router.get('/:id', authenticateToken, (req, res) => {
    const studentId = req.params.id;
    const classId = req.user.class_id;

    // Verify student belongs to teacher's class
    db.get('SELECT * FROM students WHERE id = ? AND class_id = ?', 
        [studentId, classId], (err, student) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!student) {
                return res.status(404).json({ error: 'Student not found or access denied' });
            }

            // Get student grades
            db.all(`SELECT g.*, s.name as subject_name 
                    FROM grades g 
                    JOIN subjects s ON g.subject_id = s.id 
                    WHERE g.student_id = ? 
                    ORDER BY s.name, g.semester`, 
                [studentId], (err, grades) => {
                    if (err) {
                        return res.status(500).json({ error: 'Database error' });
                    }

                    res.json({
                        student,
                        grades
                    });
                });
        });
});

module.exports = router;
