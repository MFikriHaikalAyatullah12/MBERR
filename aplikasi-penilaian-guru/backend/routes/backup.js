const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');

// Manual backup download
router.get('/download', authenticateToken, (req, res) => {
    try {
        const dbPath = path.join(__dirname, '../database/school_grades.db');
        
        if (!fs.existsSync(dbPath)) {
            return res.status(404).json({ error: 'Database file tidak ditemukan' });
        }
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const backupName = `backup_${currentUser?.name || 'unknown'}_${timestamp}.db`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${backupName}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        const fileStream = fs.createReadStream(dbPath);
        fileStream.pipe(res);
        
        console.log(`Database backup downloaded: ${backupName}`);
    } catch (error) {
        console.error('Backup download error:', error);
        res.status(500).json({ error: 'Gagal membuat backup' });
    }
});

// Auto backup function
function createAutoBackup() {
    try {
        const dbPath = path.join(__dirname, '../database/school_grades.db');
        const backupDir = path.join(__dirname, '../backups');
        
        // Create backup directory if it doesn't exist
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        if (fs.existsSync(dbPath)) {
            const timestamp = new Date().toISOString().slice(0, 10);
            const backupPath = path.join(backupDir, `auto_backup_${timestamp}.db`);
            
            // Only create backup if it doesn't exist today
            if (!fs.existsSync(backupPath)) {
                fs.copyFileSync(dbPath, backupPath);
                console.log(`Auto backup created: auto_backup_${timestamp}.db`);
                
                // Clean old backups (keep last 7 days)
                cleanOldBackups(backupDir);
            }
        }
    } catch (error) {
        console.error('Auto backup error:', error);
    }
}

// Clean old backup files
function cleanOldBackups(backupDir) {
    try {
        const files = fs.readdirSync(backupDir);
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        
        files.forEach(file => {
            if (file.startsWith('auto_backup_')) {
                const filePath = path.join(backupDir, file);
                const stats = fs.statSync(filePath);
                
                if (stats.mtime < sevenDaysAgo) {
                    fs.unlinkSync(filePath);
                    console.log(`Old backup deleted: ${file}`);
                }
            }
        });
    } catch (error) {
        console.error('Clean old backups error:', error);
    }
}

// Start auto backup (run every 24 hours)
function startAutoBackup() {
    // Create initial backup
    createAutoBackup();
    
    // Schedule daily backups
    setInterval(createAutoBackup, 24 * 60 * 60 * 1000);
    
    console.log('Auto backup system started');
}

module.exports = { router, startAutoBackup };
