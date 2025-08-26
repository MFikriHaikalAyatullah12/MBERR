const express = require('express');
const { db } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all tasks for teacher's class
router.get('/', authenticateToken, (req, res) => {
    const classId = req.user.class_id;
    const { subject_id } = req.query;
    
    let query = `SELECT t.*, s.name as subject_name 
                 FROM tasks t 
                 JOIN subjects s ON t.subject_id = s.id 
                 WHERE t.class_id = ?`;
    
    let params = [classId];
    
    if (subject_id) {
        query += ' AND t.subject_id = ?';
        params.push(subject_id);
    }
    
    query += ' ORDER BY t.created_at DESC';
    
    db.all(query, params, (err, tasks) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(tasks);
    });
});

// Get task by ID
router.get('/:id', authenticateToken, (req, res) => {
    const taskId = req.params.id;
    const classId = req.user.class_id;
    
    const query = `SELECT t.*, s.name as subject_name 
                   FROM tasks t 
                   JOIN subjects s ON t.subject_id = s.id 
                   WHERE t.id = ? AND t.class_id = ?`;
    
    db.get(query, [taskId, classId], (err, task) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (!task) {
            return res.status(404).json({ error: 'Task not found or access denied' });
        }
        
        res.json(task);
    });
});

// Add new task
router.post('/', authenticateToken, (req, res) => {
    const { name, description, subject_id, due_date } = req.body;
    const classId = req.user.class_id;
    
    if (!name || !subject_id) {
        return res.status(400).json({ error: 'Task name and subject are required' });
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
            
            db.run(`INSERT INTO tasks (name, description, subject_id, class_id, due_date) 
                    VALUES (?, ?, ?, ?, ?)`,
                [name, description, subject_id, classId, due_date || null],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to create task' });
                    }
                    
                    res.status(201).json({ 
                        message: 'Task created successfully',
                        taskId: this.lastID
                    });
                }
            );
        });
});

// Update task
router.put('/:id', authenticateToken, (req, res) => {
    const taskId = req.params.id;
    const { name, description, due_date } = req.body;
    const classId = req.user.class_id;
    
    if (!name) {
        return res.status(400).json({ error: 'Task name is required' });
    }
    
    // Verify task belongs to teacher's class
    db.get('SELECT * FROM tasks WHERE id = ? AND class_id = ?', 
        [taskId, classId], (err, task) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!task) {
                return res.status(404).json({ error: 'Task not found or access denied' });
            }
            
            db.run(`UPDATE tasks SET name = ?, description = ?, due_date = ? WHERE id = ?`,
                [name, description, due_date || null, taskId],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to update task' });
                    }
                    
                    res.json({ message: 'Task updated successfully' });
                }
            );
        });
});

// Delete task
router.delete('/:id', authenticateToken, (req, res) => {
    const taskId = req.params.id;
    const classId = req.user.class_id;
    
    // Verify task belongs to teacher's class
    db.get('SELECT * FROM tasks WHERE id = ? AND class_id = ?', 
        [taskId, classId], (err, task) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!task) {
                return res.status(404).json({ error: 'Task not found or access denied' });
            }
            
            // Delete task and related grades
            db.serialize(() => {
                db.run('DELETE FROM grades WHERE task_id = ?', [taskId]);
                db.run('DELETE FROM tasks WHERE id = ?', [taskId], function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to delete task' });
                    }
                    
                    res.json({ message: 'Task deleted successfully' });
                });
            });
        });
});

// Get task details with grades
router.get('/:id/grades', authenticateToken, (req, res) => {
    const taskId = req.params.id;
    const classId = req.user.class_id;
    
    // Verify task belongs to teacher's class
    db.get('SELECT t.*, s.name as subject_name FROM tasks t JOIN subjects s ON t.subject_id = s.id WHERE t.id = ? AND t.class_id = ?', 
        [taskId, classId], (err, task) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!task) {
                return res.status(404).json({ error: 'Task not found or access denied' });
            }
            
            // Get all students in class with their grades for this task
            db.all(`SELECT 
                        st.id as student_id,
                        st.name as student_name,
                        st.nis,
                        g.id as grade_id,
                        g.grade_value,
                        g.semester,
                        g.academic_year
                    FROM students st
                    LEFT JOIN grades g ON st.id = g.student_id AND g.task_id = ?
                    WHERE st.class_id = ?
                    ORDER BY st.name`, 
                [taskId, classId], (err, students) => {
                    if (err) {
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                    res.json({
                        task,
                        students
                    });
                });
        });
});

// Get tasks by subject for bulk grading
router.get('/by-subject/:subjectId', authenticateToken, (req, res) => {
    const subjectId = req.params.subjectId;
    const classId = req.user.class_id;
    
    // Verify subject belongs to teacher's class
    db.get('SELECT * FROM subjects WHERE id = ? AND class_id = ?', 
        [subjectId, classId], (err, subject) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!subject) {
                return res.status(404).json({ error: 'Subject not found or access denied' });
            }
            
            // Get tasks for the subject
            db.all('SELECT * FROM tasks WHERE subject_id = ? AND class_id = ? ORDER BY name', 
                [subjectId, classId], (err, tasks) => {
                    if (err) {
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.json(tasks);
                });
        });
});

module.exports = router;
