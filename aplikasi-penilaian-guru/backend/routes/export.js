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

                    // Create summary sheet with enhanced calculations
                    const summaryData = [];
                    Array.from(allStudents).forEach(studentName => {
                        const studentRow = {
                            'Nama Siswa': studentName,
                            'NIS': '-' // Will be filled from first subject data
                        };

                        let totalGrades = 0;
                        let subjectCount = 0;

                        // Add final grades for each subject and calculate overall average
                        Object.keys(subjectData).forEach(subjectName => {
                            const studentData = subjectData[subjectName][studentName];
                            if (studentData) {
                                if (studentRow['NIS'] === '-') {
                                    studentRow['NIS'] = studentData['NIS'];
                                }
                                const finalGrade = studentData['Nilai Akhir'];
                                if (finalGrade && !isNaN(parseFloat(finalGrade))) {
                                    studentRow[subjectName] = parseFloat(finalGrade).toFixed(1);
                                    totalGrades += parseFloat(finalGrade);
                                    subjectCount++;
                                } else {
                                    studentRow[subjectName] = '-';
                                }
                            } else {
                                studentRow[subjectName] = '-';
                            }
                        });

                        // Add calculated columns
                        studentRow['Rata-rata Keseluruhan'] = subjectCount > 0 ? (totalGrades / subjectCount).toFixed(1) : '-';
                        studentRow['Jumlah Mapel'] = subjectCount;

                        summaryData.push(studentRow);
                    });

                    if (summaryData.length === 0) {
                        summaryData.push({
                            'Nama Siswa': 'Belum ada data',
                            'NIS': '-'
                        });
                    } else {
                        // Add class statistics row for summary
                        const summaryStatsRow = {
                            'Nama Siswa': 'RATA-RATA KELAS',
                            'NIS': '-'
                        };
                        
                        // Calculate class averages for each subject
                        Object.keys(subjectData).forEach(subjectName => {
                            const values = [];
                            summaryData.forEach(student => {
                                const value = parseFloat(student[subjectName]);
                                if (!isNaN(value)) {
                                    values.push(value);
                                }
                            });
                            
                            if (values.length > 0) {
                                const average = values.reduce((sum, val) => sum + val, 0) / values.length;
                                summaryStatsRow[subjectName] = average.toFixed(1);
                            } else {
                                summaryStatsRow[subjectName] = '-';
                            }
                        });
                        
                        // Calculate overall class average
                        const overallValues = [];
                        summaryData.forEach(student => {
                            const value = parseFloat(student['Rata-rata Keseluruhan']);
                            if (!isNaN(value)) {
                                overallValues.push(value);
                            }
                        });
                        
                        if (overallValues.length > 0) {
                            const overallAverage = overallValues.reduce((sum, val) => sum + val, 0) / overallValues.length;
                            summaryStatsRow['Rata-rata Keseluruhan'] = overallAverage.toFixed(1);
                        } else {
                            summaryStatsRow['Rata-rata Keseluruhan'] = '-';
                        }
                        
                        summaryStatsRow['Jumlah Mapel'] = 'Total';
                        summaryData.push(summaryStatsRow);
                    }

                    // Create summary worksheet
                    const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
                    const summaryColCount = Object.keys(summaryData[0] || {}).length;
                    const summaryColWidths = [
                        { wch: 25 }, // Nama Siswa
                        { wch: 15 }, // NIS
                    ];

                    // Add width for subject columns
                    const subjectCount = Object.keys(subjectData).length;
                    for (let i = 2; i < 2 + subjectCount; i++) {
                        summaryColWidths.push({ wch: 15 });
                    }
                    
                    // Add width for calculation columns
                    summaryColWidths.push({ wch: 20 }); // Rata-rata Keseluruhan
                    summaryColWidths.push({ wch: 15 }); // Jumlah Mapel

                    summaryWorksheet['!cols'] = summaryColWidths;
                    
                    // Add summary sheet first
                    XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Ringkasan Nilai');

                    // Create sheet for each subject with detailed grades and calculations
                    Object.keys(subjectData).forEach(subjectName => {
                        const students = subjectData[subjectName];
                        const excelData = Object.values(students);

                        if (excelData.length === 0) {
                            excelData.push({
                                'Nama Siswa': 'Belum ada data',
                                'NIS': '-'
                            });
                        } else {
                            // Add calculations for each student
                            excelData.forEach(studentData => {
                                let taskTotal = 0;
                                let taskCount = 0;
                                
                                // Calculate task totals and count
                                Object.keys(studentData).forEach(key => {
                                    if (key !== 'Nama Siswa' && key !== 'NIS' && key !== 'Nilai Akhir') {
                                        const value = parseFloat(studentData[key]);
                                        if (!isNaN(value)) {
                                            taskTotal += value;
                                            taskCount++;
                                        }
                                    }
                                });
                                
                                // Add calculated columns
                                studentData['Jumlah Nilai Tugas'] = taskCount > 0 ? taskTotal.toFixed(1) : '-';
                                studentData['Rata-rata Tugas'] = taskCount > 0 ? (taskTotal / taskCount).toFixed(1) : '-';
                                
                                // Calculate overall average (tasks 70% + final 30%)
                                const finalGrade = parseFloat(studentData['Nilai Akhir']);
                                if (taskCount > 0 && !isNaN(finalGrade)) {
                                    const taskAverage = taskTotal / taskCount;
                                    const overallAverage = (taskAverage * 0.7) + (finalGrade * 0.3);
                                    studentData['Rata-rata Keseluruhan'] = overallAverage.toFixed(1);
                                } else if (taskCount > 0) {
                                    studentData['Rata-rata Keseluruhan'] = (taskTotal / taskCount).toFixed(1);
                                } else if (!isNaN(finalGrade)) {
                                    studentData['Rata-rata Keseluruhan'] = finalGrade.toFixed(1);
                                } else {
                                    studentData['Rata-rata Keseluruhan'] = '-';
                                }
                            });
                            
                            // Add class statistics row
                            const statsRow = {
                                'Nama Siswa': 'STATISTIK KELAS',
                                'NIS': '-'
                            };
                            
                            // Calculate class averages for each column
                            Object.keys(excelData[0]).forEach(key => {
                                if (key !== 'Nama Siswa' && key !== 'NIS') {
                                    const values = [];
                                    excelData.forEach(student => {
                                        const value = parseFloat(student[key]);
                                        if (!isNaN(value)) {
                                            values.push(value);
                                        }
                                    });
                                    
                                    if (values.length > 0) {
                                        const average = values.reduce((sum, val) => sum + val, 0) / values.length;
                                        statsRow[key] = average.toFixed(1);
                                    } else {
                                        statsRow[key] = '-';
                                    }
                                }
                            });
                            
                            excelData.push(statsRow);
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
                            if (i === colCount - 3) { // Jumlah Nilai Tugas
                                colWidths.push({ wch: 18 });
                            } else if (i === colCount - 2) { // Rata-rata Tugas
                                colWidths.push({ wch: 18 });
                            } else if (i === colCount - 1) { // Rata-rata Keseluruhan
                                colWidths.push({ wch: 20 });
                            } else {
                                colWidths.push({ wch: 15 });
                            }
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
