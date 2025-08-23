const { db } = require('./models/database');

console.log('Adding created_at column to users table...');

db.serialize(() => {
    // Check if created_at column exists
    db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
            console.error('Error checking table info:', err);
            return;
        }
        
        const hasCreatedAt = columns.some(col => col.name === 'created_at');
        
        if (!hasCreatedAt) {
            console.log('Adding created_at column...');
            db.run("ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP", (err) => {
                if (err) {
                    console.error('Error adding created_at column:', err);
                } else {
                    console.log('Successfully added created_at column');
                    
                    // Update existing users with current timestamp
                    db.run("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL", (err) => {
                        if (err) {
                            console.error('Error updating existing users:', err);
                        } else {
                            console.log('Updated existing users with created_at timestamp');
                        }
                        db.close();
                    });
                }
            });
        } else {
            console.log('created_at column already exists');
            db.close();
        }
    });
});
