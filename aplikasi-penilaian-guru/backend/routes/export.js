const express = require('express');
const XLSX = require('xlsx');
const { db } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Helper function to clean names for Excel
function cleanExcelName(name) {
    if (!name) return 'Unknown';
    // Remove invalid characters for Excel sheet names and file names
    return name.replace(/[\\\/\?\*\[\]:]/g, '').trim();
}

// Export grades to Excel
router.get('/excel', authenticateToken, (req, res) => {
    try {
        const classId = req.user.class_id;
        const { semester, academic_year } = req.query;

        let query = `SELECT 
                        s.name as student_name,
                        s.nis,
                        sub.name as subject_name,
                        g.grade_value,
                        g.grade_type,
                        g.semester,
                        g.academic_year,
                        t.name as task_name
                     FROM students s
                     LEFT JOIN grades g ON s.id = g.student_id
                     LEFT JOIN subjects sub ON g.subject_id = sub.id
                     LEFT JOIN tasks t ON g.task_id = t.id
                     WHERE s.class_id = ?`;
        
        let params = [classId];

        if (semester) {
            query += ' AND (g.semester = ? OR g.semester IS NULL)';
            params.push(semester);
        }

        if (academic_year) {
            query += ' AND (g.academic_year = ? OR g.academic_year IS NULL)';
            params.push(academic_year);
        }

        query += ' ORDER BY s.name, sub.name, g.grade_type DESC';

        db.all(query, params, (err, data) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error: ' + err.message });
            }

            // Get class info
            db.get('SELECT name FROM classes WHERE id = ?', [classId], (err, classInfo) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error: ' + err.message });
                }

                try {
                    // Transform data for Excel
                    const students = {};
                    const subjects = new Set();

                    data.forEach(row => {
                        if (!students[row.student_name]) {
                            students[row.student_name] = {
                                'Nama Siswa': row.student_name,
                                'NIS': row.nis || '-'
                            };
                        }

                        if (row.subject_name && row.grade_value !== null) {
                            const gradeKey = row.grade_type === 'task' 
                                ? `${row.subject_name} - ${row.task_name || 'Tugas'}`
                                : `${row.subject_name} - Nilai Akhir`;
                            
                            students[row.student_name][gradeKey] = row.grade_value;
                            subjects.add(gradeKey);
                        }
                    });

                    // Convert to array for Excel
                    const excelData = Object.values(students);

                    if (excelData.length === 0) {
                        excelData.push({
                            'Nama Siswa': 'Belum ada data',
                            'NIS': '-'
                        });
                    }

                    // Create workbook
                    const workbook = XLSX.utils.book_new();
                    const worksheet = XLSX.utils.json_to_sheet(excelData);

                    // Set column widths
                    const colWidths = [
                        { wch: 25 }, // Nama Siswa
                        { wch: 15 }, // NIS
                    ];

                    // Add subject columns
                    subjects.forEach(() => {
                        colWidths.push({ wch: 15 });
                    });

                    worksheet['!cols'] = colWidths;

                    // Add worksheet to workbook
                    const className = cleanExcelName(classInfo ? classInfo.name : 'Unknown');
                    const sheetName = cleanExcelName(`${className}_${semester ? `Sem${semester}_` : ''}${academic_year || new Date().getFullYear()}`);
                    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

                    // Generate buffer
                    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

                    // Set headers for download
                    const filename = cleanExcelName(`Nilai_${sheetName}_${new Date().toISOString().slice(0,10)}`) + '.xlsx';
                    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                    res.setHeader('Content-Length', buffer.length);

                    res.send(buffer);
                } catch (error) {
                    console.error('Excel generation error:', error);
                    return res.status(500).json({ error: 'Failed to generate Excel file: ' + error.message });
                }
            });
        });
    } catch (error) {
        console.error('Export error:', error);
        return res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

// Export student list to Excel
router.get('/students/excel', authenticateToken, (req, res) => {
    try {
        const classId = req.user.class_id;

        db.all('SELECT name, nis, created_at FROM students WHERE class_id = ? ORDER BY name', 
            [classId], (err, students) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error: ' + err.message });
                }

                // Get class info
                db.get('SELECT name FROM classes WHERE id = ?', [classId], (err, classInfo) => {
                    if (err) {
                        console.error('Database error:', err);
                        return res.status(500).json({ error: 'Database error: ' + err.message });
                    }

                    try {
                        // Transform data for Excel
                        const excelData = students.map((student, index) => ({
                            'No': index + 1,
                            'Nama Siswa': student.name,
                            'NIS': student.nis || '-',
                            'Tanggal Daftar': student.created_at ? new Date(student.created_at).toLocaleDateString('id-ID') : '-'
                        }));

                        if (excelData.length === 0) {
                            excelData.push({
                                'No': 1,
                                'Nama Siswa': 'Belum ada data siswa',
                                'NIS': '-',
                                'Tanggal Daftar': '-'
                            });
                        }

                        // Create workbook
                        const workbook = XLSX.utils.book_new();
                        const worksheet = XLSX.utils.json_to_sheet(excelData);

                        // Set column widths
                        worksheet['!cols'] = [
                            { wch: 5 },  // No
                            { wch: 25 }, // Nama Siswa
                            { wch: 15 }, // NIS
                            { wch: 15 }  // Tanggal Daftar
                        ];

                        // Add worksheet to workbook
                        const className = cleanExcelName(classInfo ? classInfo.name : 'Unknown');
                        const sheetName = cleanExcelName(`Daftar_Siswa_${className}`);
                        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

                        // Generate buffer
                        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

                        // Set headers for download
                        const filename = cleanExcelName(`${sheetName}_${new Date().toISOString().slice(0,10)}`) + '.xlsx';
                        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                        res.setHeader('Content-Length', buffer.length);

                        res.send(buffer);
                    } catch (error) {
                        console.error('Excel generation error:', error);
                        return res.status(500).json({ error: 'Failed to generate Excel file: ' + error.message });
                    }
                });
            });
    } catch (error) {
        console.error('Export error:', error);
        return res.status(500).json({ error: 'Export failed: ' + error.message });
    }
});

module.exports = router;
