const { db } = require('./models/database');

console.log('Fixing users table schema...');

db.serialize(() => {
    // Check current table structure
    db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
            console.error('Error checking table info:', err);
            return;
        }
        
        console.log('Current columns in users table:');
        columns.forEach(col => {
            console.log(`- ${col.name} (${col.type})`);
        });
        
        const hasProfilePicture = columns.some(col => col.name === 'profile_picture');
        const hasCreatedAt = columns.some(col => col.name === 'created_at');
        
        const promises = [];
        
        if (!hasProfilePicture) {
            console.log('\nAdding profile_picture column...');
            promises.push(new Promise((resolve, reject) => {
                db.run("ALTER TABLE users ADD COLUMN profile_picture TEXT", (err) => {
                    if (err) {
                        console.error('Error adding profile_picture column:', err);
                        reject(err);
                    } else {
                        console.log('Successfully added profile_picture column');
                        resolve();
                    }
                });
            }));
        } else {
            console.log('\nprofile_picture column already exists');
        }
        
        if (!hasCreatedAt) {
            console.log('Adding created_at column...');
            promises.push(new Promise((resolve, reject) => {
                db.run("ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP", (err) => {
                    if (err) {
                        console.error('Error adding created_at column:', err);
                        reject(err);
                    } else {
                        console.log('Successfully added created_at column');
                        // Update existing users
                        db.run("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL", (updateErr) => {
                            if (updateErr) {
                                console.error('Error updating existing users:', updateErr);
                                reject(updateErr);
                            } else {
                                console.log('Updated existing users with created_at timestamp');
                                resolve();
                            }
                        });
                    }
                });
            }));
        } else {
            console.log('created_at column already exists');
        }
        
        Promise.all(promises).then(() => {
            console.log('\nDatabase schema update completed!');
            
            // Verify final structure
            db.all("PRAGMA table_info(users)", (err, finalColumns) => {
                if (err) {
                    console.error('Error checking final table structure:', err);
                } else {
                    console.log('\nFinal table structure:');
                    finalColumns.forEach(col => {
                        console.log(`- ${col.name} (${col.type})`);
                    });
                }
                db.close();
            });
        }).catch(err => {
            console.error('Error during schema update:', err);
            db.close();
        });
    });
});
