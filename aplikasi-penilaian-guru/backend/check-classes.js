const { db } = require('./models/database');

console.log('Checking and fixing classes data...');

db.serialize(() => {
    // First check classes
    db.all("SELECT * FROM classes ORDER BY id", (err, classes) => {
        if (err) {
            console.error('Error fetching classes:', err);
            return;
        }
        
        console.log('Classes found:');
        classes.forEach(cls => {
            console.log(`ID: ${cls.id}, Name: ${cls.name}, Description: ${cls.description}`);
        });
        
        // Ensure all 6 classes exist
        const expectedClasses = [
            { id: 1, name: 'Kelas 1', description: 'Kelas 1 SD' },
            { id: 2, name: 'Kelas 2', description: 'Kelas 2 SD' },
            { id: 3, name: 'Kelas 3', description: 'Kelas 3 SD' },
            { id: 4, name: 'Kelas 4', description: 'Kelas 4 SD' },
            { id: 5, name: 'Kelas 5', description: 'Kelas 5 SD' },
            { id: 6, name: 'Kelas 6', description: 'Kelas 6 SD' }
        ];
        
        expectedClasses.forEach(expectedClass => {
            const exists = classes.find(cls => cls.id === expectedClass.id);
            if (!exists) {
                console.log(`Inserting missing class: ${expectedClass.name}`);
                db.run(`INSERT INTO classes (id, name, description) VALUES (?, ?, ?)`,
                    [expectedClass.id, expectedClass.name, expectedClass.description]);
            }
        });
        
        // Check users and their class assignments
        db.all("SELECT id, name, username, class_id FROM users ORDER BY class_id", (err, users) => {
            if (err) {
                console.error('Error fetching users:', err);
                return;
            }
            
            console.log('\nUsers and their class assignments:');
            users.forEach(user => {
                console.log(`User: ${user.name} (${user.username}) -> Class ${user.class_id}`);
            });
            
            // Check available classes for registration
            db.all(`SELECT c.*, 
                    CASE WHEN u.id IS NOT NULL THEN 1 ELSE 0 END AS is_assigned
                    FROM classes c 
                    LEFT JOIN users u ON c.id = u.class_id
                    ORDER BY c.id`,
                (err, availableClasses) => {
                    if (err) {
                        console.error('Error fetching available classes:', err);
                        return;
                    }
                    
                    console.log('\nAvailable classes for registration:');
                    availableClasses.forEach(cls => {
                        const status = cls.is_assigned ? 'ASSIGNED' : 'AVAILABLE';
                        console.log(`${cls.name} (ID: ${cls.id}) - ${status}`);
                    });
                    
                    // If Kelas 6 is assigned but should be available, we can check who's assigned
                    const kelas6 = availableClasses.find(cls => cls.id === 6);
                    if (kelas6 && kelas6.is_assigned) {
                        console.log('\nKelas 6 is assigned. If you want to make it available, you need to:');
                        console.log('1. Delete the user assigned to Kelas 6, OR');
                        console.log('2. Change the user\'s class assignment to another class');
                    }
                    
                    db.close();
                    console.log('\nCheck completed!');
                });
        });
    });
});
