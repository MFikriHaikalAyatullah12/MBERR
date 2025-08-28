 // Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');
const classRoutes = require('./routes/classes');
const studentRoutes = require('./routes/students');
const gradeRoutes = require('./routes/grades');
const taskRoutes = require('./routes/tasks');
const exportRoutes = require('./routes/export');
// const { router: backupRoutes, startAutoBackup } = require('./routes/backup');
const { initializeDatabase } = require('./models/database');

const app = express();
const PORT = process.env.PORT || 3000;

console.log(`Starting ${process.env.APP_NAME || 'Aplikasi Penilaian Guru'} v${process.env.APP_VERSION || '1.0.0'}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize database
initializeDatabase();

// Start auto backup system
// startAutoBackup();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/export', exportRoutes);
// app.use('/api/backup', backupRoutes);

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler - only for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
});

// Serve static files for other requests
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
    console.log(`Akses aplikasi di: http://localhost:${PORT}`);
});
