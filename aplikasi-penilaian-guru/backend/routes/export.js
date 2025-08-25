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
                    // Group data by subject
                    const subjectData = {};
                    const allStudents = new Set();

                    // Collect all students and group data by subject
                    data.forEach(row => {
                        allStudents.add(row.student_name);
                        
                        if (row.subject_name && row.grade_value !== null) {
                            if (!subjectData[row.subject_name]) {
                                subjectData[row.subject_name] = {};
                            }
                            
                            if (!subjectData[row.subject_name][row.student_name]) {
                                subjectData[row.subject_name][row.student_name] = {
                                    'Nama Siswa': row.student_name,
                                    'NIS': row.nis || '-'
                                };
                            }
                            
                            // Add grades based on type
                            if (row.grade_type === 'task') {
                                const taskKey = row.task_name || 'Tugas';
                                subjectData[row.subject_name][row.student_name][taskKey] = row.grade_value;
                            } else {
                                subjectData[row.subject_name][row.student_name]['Nilai Akhir'] = row.grade_value;
                            }
                        }
                    });

                    // Create workbook
                    const workbook = XLSX.utils.book_new();

                    // Create summary sheet with all subjects (final grades only)
                    const summaryData = [];
                    Array.from(allStudents).forEach(studentName => {
                        const studentRow = {
                            'Nama Siswa': studentName,
                            'NIS': '-' // Will be filled from first subject data
                        };

                        // Add final grades for each subject
                        Object.keys(subjectData).forEach(subjectName => {
                            const studentData = subjectData[subjectName][studentName];
                            if (studentData) {
                                if (studentRow['NIS'] === '-') {
                                    studentRow['NIS'] = studentData['NIS'];
                                }
                                studentRow[subjectName] = studentData['Nilai Akhir'] || '-';
                            } else {
                                studentRow[subjectName] = '-';
                            }
                        });

                        summaryData.push(studentRow);
                    });

                    if (summaryData.length === 0) {
                        summaryData.push({
                            'Nama Siswa': 'Belum ada data',
                            'NIS': '-'
                        });
                    }

                    // Calculate averages for summary sheet
                    if (summaryData.length > 0 && Object.keys(subjectData).length > 0) {
                        const avgRow = {
                            'Nama Siswa': 'RATA-RATA KELAS',
                            'NIS': '-'
                        };

                        Object.keys(subjectData).forEach(subjectName => {
                            const subjectGrades = [];
                            summaryData.forEach(student => {
                                const grade = parseFloat(student[subjectName]);
                                if (!isNaN(grade)) {
                                    subjectGrades.push(grade);
                                }
                            });

                            if (subjectGrades.length > 0) {
                                const average = subjectGrades.reduce((sum, grade) => sum + grade, 0) / subjectGrades.length;
                                avgRow[subjectName] = average.toFixed(1);
                            } else {
                                avgRow[subjectName] = '-';
                            }
                        });

                        summaryData.push(avgRow);
                    }

                    // Create summary worksheet
                    const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
                    const summaryColCount = Object.keys(summaryData[0] || {}).length;
                    const summaryColWidths = [
                        { wch: 25 }, // Nama Siswa
                        { wch: 15 }, // NIS
                    ];

                    for (let i = 2; i < summaryColCount; i++) {
                        summaryColWidths.push({ wch: 15 });
                    }

                    summaryWorksheet['!cols'] = summaryColWidths;
                    
                    // Add summary sheet first
                    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Ringkasan Nilai');

                    // Create sheet for each subject with detailed grades
                    Object.keys(subjectData).forEach(subjectName => {
                        const students = subjectData[subjectName];
                        const excelData = Object.values(students);

                        if (excelData.length === 0) {
                            excelData.push({
                                'Nama Siswa': 'Belum ada data',
                                'NIS': '-'
                            });
                        } else {
                            // Calculate totals and averages for each student
                            excelData.forEach(studentData => {
                                let totalScore = 0;
                                let taskCount = 0;
                                let taskScores = [];

                                // Collect all task scores (exclude 'Nama Siswa', 'NIS', and 'Nilai Akhir')
                                Object.keys(studentData).forEach(key => {
                                    if (key !== 'Nama Siswa' && key !== 'NIS' && key !== 'Nilai Akhir') {
                                        const score = parseFloat(studentData[key]);
                                        if (!isNaN(score)) {
                                            taskScores.push(score);
                                            totalScore += score;
                                            taskCount++;
                                        }
                                    }
                                });

                                // Add calculated fields
                                studentData['Jumlah Nilai Tugas'] = taskCount > 0 ? totalScore.toFixed(1) : '-';
                                studentData['Rata-rata Tugas'] = taskCount > 0 ? (totalScore / taskCount).toFixed(1) : '-';
                                
                                // Calculate final average including final grade if exists
                                if (studentData['Nilai Akhir'] && !isNaN(parseFloat(studentData['Nilai Akhir']))) {
                                    const finalGrade = parseFloat(studentData['Nilai Akhir']);
                                    const taskAverage = taskCount > 0 ? totalScore / taskCount : 0;
                                    // Weight: 70% tasks, 30% final
                                    const finalAverage = taskCount > 0 ? 
                                        (taskAverage * 0.7 + finalGrade * 0.3) : finalGrade;
                                    studentData['Nilai Rata-rata Akhir'] = finalAverage.toFixed(1);
                                } else {
                                    studentData['Nilai Rata-rata Akhir'] = studentData['Rata-rata Tugas'];
                                }
                            });

                            // Add summary row at the end
                            const summaryRow = {
                                'Nama Siswa': '=== STATISTIK KELAS ===',
                                'NIS': ''
                            };

                            // Calculate class statistics for each column
                            const firstStudent = excelData[0];
                            Object.keys(firstStudent).forEach(key => {
                                if (key !== 'Nama Siswa' && key !== 'NIS') {
                                    const scores = excelData
                                        .map(student => parseFloat(student[key]))
                                        .filter(score => !isNaN(score));
                                    
                                    if (scores.length > 0) {
                                        const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                                        summaryRow[key] = `Rata: ${average.toFixed(1)}`;
                                    } else {
                                        summaryRow[key] = '-';
                                    }
                                }
                            });

                            excelData.push(summaryRow);
                        }

                        // Create worksheet for this subject
                        const worksheet = XLSX.utils.json_to_sheet(excelData);

                        // Set column widths
                        const colCount = Object.keys(excelData[0] || {}).length;
                        const colWidths = [
                            { wch: 25 }, // Nama Siswa
                            { wch: 15 }, // NIS
                        ];

                        // Add dynamic width for grade columns
                        for (let i = 2; i < colCount; i++) {
                            colWidths.push({ wch: 15 });
                        }

                        worksheet['!cols'] = colWidths;

                        // Clean subject name for sheet name (remove invalid characters)
                        const cleanSubjectName = cleanExcelName(subjectName);
                        XLSX.utils.book_append_sheet(workbook, worksheet, cleanSubjectName);
                    });

                    // Generate buffer
                    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

                    // Set headers for download
                    const className = cleanExcelName(classInfo ? classInfo.name : 'Unknown');
                    const filename = cleanExcelName(`Nilai_Per_Mapel_${className}_${semester ? `Sem${semester}_` : ''}${academic_year || new Date().getFullYear()}_${new Date().toISOString().slice(0,10)}`) + '.xlsx';
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
