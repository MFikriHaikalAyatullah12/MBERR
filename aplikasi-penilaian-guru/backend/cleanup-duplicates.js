const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/school_grades.db');
const db = new sqlite3.Database(dbPath);

console.log('Starting cleanup of duplicate subjects...');

db.serialize(() => {
    // First, check existing subjects
    db.all("SELECT id, name, class_id, COUNT(*) as count FROM subjects GROUP BY name, class_id HAVING COUNT(*) > 1", (err, duplicates) => {
        if (err) {
            console.error('Error finding duplicates:', err);
            return;
        }
        
        console.log('Found duplicates:', duplicates);
        
        // Delete duplicates, keeping only the first (minimum id) of each group
        db.run(`DELETE FROM subjects 
                WHERE id NOT IN (
                    SELECT MIN(id) 
                    FROM subjects 
                    GROUP BY name, class_id
                )`, (err) => {
            if (err) {
                console.error('Error deleting duplicates:', err);
                return;
            }
            
            console.log('Duplicates deleted successfully');
            
            // Show remaining subjects
            db.all("SELECT id, name, class_id FROM subjects ORDER BY class_id, name", (err, remaining) => {
                if (err) {
                    console.error('Error fetching remaining subjects:', err);
                    return;
                }
                
                console.log('Remaining subjects:');
                remaining.forEach(subject => {
                    console.log(`ID: ${subject.id}, Name: ${subject.name}, Class: ${subject.class_id}`);
                });
                
                db.close();
                console.log('Cleanup completed successfully!');
            });
        });
    });
});
