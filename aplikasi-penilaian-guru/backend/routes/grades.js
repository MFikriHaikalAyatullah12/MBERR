const express = require('express');
const { db } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all subjects for teacher's class
router.get('/subjects', authenticateToken, (req, res) => {
    const classId = req.user.class_id;
    
    db.all('SELECT * FROM subjects WHERE class_id = ? ORDER BY name', [classId], (err, subjects) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(subjects);
    });
});

// Get custom subject options for Seni
router.get('/subjects/seni-options', authenticateToken, (req, res) => {
    const seniOptions = [
        { id: 'seni_rupa', name: 'Seni Rupa' },
        { id: 'seni_teater', name: 'Seni Teater' },
        { id: 'seni_musik', name: 'Seni Musik' },
        { id: 'seni_tari', name: 'Seni Tari' }
    ];
    res.json(seniOptions);
});

// Update custom Seni subject
router.post('/subjects/update-seni', authenticateToken, (req, res) => {
    const { seni_type } = req.body;
    const classId = req.user.class_id;
    
    if (!seni_type) {
        return res.status(400).json({ error: 'Seni type is required' });
    }
    
    const seniNames = {
        'seni_rupa': 'Seni Rupa',
        'seni_teater': 'Seni Teater', 
        'seni_musik': 'Seni Musik',
        'seni_tari': 'Seni Tari'
    };
    
    const newName = seniNames[seni_type];
    if (!newName) {
        return res.status(400).json({ error: 'Invalid seni type' });
    }
    
    db.run(`UPDATE subjects SET name = ? WHERE name = 'Seni' AND class_id = ?`,
        [newName, classId], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update subject' });
            }
            
            res.json({ message: 'Seni subject updated successfully' });
        });
});

// Get grades for teacher's class
router.get('/', authenticateToken, (req, res) => {
    const classId = req.user.class_id;
    const { semester, academic_year, subject_id, grade_type } = req.query;

    let query = `SELECT g.*, s.name as student_name, sub.name as subject_name, t.name as task_name
                 FROM grades g 
                 JOIN students s ON g.student_id = s.id 
                 JOIN subjects sub ON g.subject_id = sub.id 
                 LEFT JOIN tasks t ON g.task_id = t.id
                 WHERE s.class_id = ?`;
    
    let params = [classId];

    if (semester) {
        query += ' AND g.semester = ?';
        params.push(semester);
    }

    if (academic_year) {
        query += ' AND g.academic_year = ?';
        params.push(academic_year);
    }

    if (subject_id) {
        query += ' AND g.subject_id = ?';
        params.push(subject_id);
    }

    if (grade_type) {
        query += ' AND g.grade_type = ?';
        params.push(grade_type);
    }

    query += ' ORDER BY s.name, sub.name, g.created_at DESC';

    db.all(query, params, (err, grades) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(grades);
    });
});

// Add or update grade
router.post('/', authenticateToken, (req, res) => {
    const { student_id, subject_id, task_id, grade_value, grade_type, semester, academic_year } = req.body;
    const classId = req.user.class_id;

    if (!student_id || !subject_id || grade_value === undefined || !semester || !academic_year) {
        return res.status(400).json({ error: 'Required fields: student_id, subject_id, grade_value, semester, academic_year' });
    }

    if (grade_value < 0 || grade_value > 100) {
        return res.status(400).json({ error: 'Grade must be between 0 and 100' });
    }

    const finalGradeType = grade_type || (task_id ? 'task' : 'final');

    // Verify student belongs to teacher's class
    db.get('SELECT * FROM students WHERE id = ? AND class_id = ?', 
        [student_id, classId], (err, student) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!student) {
                return res.status(404).json({ error: 'Student not found or access denied' });
            }

            // Verify subject belongs to teacher's class
            db.get('SELECT * FROM subjects WHERE id = ? AND class_id = ?', 
                [subject_id, classId], (err, subject) => {
                    if (err) {
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                    if (!subject) {
                        return res.status(404).json({ error: 'Subject not found or access denied' });
                    }

                    // Check if task exists (if task_id provided)
                    if (task_id) {
                        db.get('SELECT * FROM tasks WHERE id = ? AND class_id = ? AND subject_id = ?', 
                            [task_id, classId, subject_id], (err, task) => {
                                if (err) {
                                    return res.status(500).json({ error: 'Database error' });
                                }
                                
                                if (!task) {
                                    return res.status(404).json({ error: 'Task not found or access denied' });
                                }
                                
                                insertOrUpdateGrade();
                            });
                    } else {
                        insertOrUpdateGrade();
                    }

                    function insertOrUpdateGrade() {
                        // Check if grade already exists
                        let checkQuery = `SELECT * FROM grades 
                                         WHERE student_id = ? AND subject_id = ? AND semester = ? AND academic_year = ?`;
                        let checkParams = [student_id, subject_id, semester, academic_year];
                        
                        if (task_id) {
                            checkQuery += ' AND task_id = ?';
                            checkParams.push(task_id);
                        } else {
                            checkQuery += ' AND task_id IS NULL';
                        }
                        
                        checkQuery += ' AND grade_type = ?';
                        checkParams.push(finalGradeType);

                        db.get(checkQuery, checkParams, (err, existingGrade) => {
                            if (err) {
                                return res.status(500).json({ error: 'Database error' });
                            }

                            if (existingGrade) {
                                // Update existing grade
                                db.run(`UPDATE grades 
                                        SET grade_value = ?, updated_at = CURRENT_TIMESTAMP 
                                        WHERE id = ?`,
                                    [grade_value, existingGrade.id], function(err) {
                                        if (err) {
                                            return res.status(500).json({ error: 'Failed to update grade' });
                                        }

                                        res.json({ message: 'Grade updated successfully' });
                                    });
                            } else {
                                // Insert new grade
                                db.run(`INSERT INTO grades (student_id, subject_id, task_id, grade_value, grade_type, semester, academic_year) 
                                        VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                    [student_id, subject_id, task_id || null, grade_value, finalGradeType, semester, academic_year], 
                                    function(err) {
                                        if (err) {
                                            return res.status(500).json({ error: 'Failed to add grade' });
                                        }

                                        res.status(201).json({ 
                                            message: 'Grade added successfully',
                                            gradeId: this.lastID
                                        });
                                    });
                            }
                        });
                    }
                });
        });
});

// Delete grade
router.delete('/:id', authenticateToken, (req, res) => {
    const gradeId = req.params.id;
    const classId = req.user.class_id;

    // Verify grade belongs to teacher's class
    db.get(`SELECT g.* FROM grades g 
            JOIN students s ON g.student_id = s.id 
            WHERE g.id = ? AND s.class_id = ?`, 
        [gradeId, classId], (err, grade) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!grade) {
                return res.status(404).json({ error: 'Grade not found or access denied' });
            }

            db.run('DELETE FROM grades WHERE id = ?', [gradeId], function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Failed to delete grade' });
                }

                res.json({ message: 'Grade deleted successfully' });
            });
        });
});

// Get grade summary for a student
router.get('/student/:studentId/summary', authenticateToken, (req, res) => {
    const studentId = req.params.studentId;
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

            // Get grades summary
            db.all(`SELECT sub.name as subject_name, g.semester, g.academic_year, g.grade_value
                    FROM grades g 
                    JOIN subjects sub ON g.subject_id = sub.id 
                    WHERE g.student_id = ? 
                    ORDER BY sub.name, g.academic_year, g.semester`, 
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
