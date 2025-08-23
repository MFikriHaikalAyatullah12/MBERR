const { db } = require('./models/database');

console.log('Adding profile_picture column to users table...');

db.serialize(() => {
    // Check if profile_picture column exists
    db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
            console.error('Error checking table info:', err);
            return;
        }
        
        const hasProfilePicture = columns.some(col => col.name === 'profile_picture');
        
        if (!hasProfilePicture) {
            console.log('Adding profile_picture column...');
            db.run("ALTER TABLE users ADD COLUMN profile_picture TEXT", (err) => {
                if (err) {
                    console.error('Error adding profile_picture column:', err);
                } else {
                    console.log('Successfully added profile_picture column');
                }
                db.close();
            });
        } else {
            console.log('profile_picture column already exists');
            db.close();
        }
    });
});
