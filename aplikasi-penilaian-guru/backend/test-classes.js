const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/classes',
    method: 'GET'
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const classes = JSON.parse(data);
            console.log('Classes response:');
            console.log(JSON.stringify(classes, null, 2));
            
            console.log('\nClass count:', classes.length);
            
            // Verify all 6 classes are present
            const expectedClasses = ['Kelas 1', 'Kelas 2', 'Kelas 3', 'Kelas 4', 'Kelas 5', 'Kelas 6'];
            expectedClasses.forEach((className, index) => {
                const found = classes.find(cls => cls.name === className);
                if (found) {
                    console.log(`✓ ${className} found (ID: ${found.id})`);
                } else {
                    console.log(`✗ ${className} missing`);
                }
            });
        } catch (error) {
            console.error('Error parsing response:', error);
        }
    });
});

req.on('error', (error) => {
    console.error('Request error:', error);
});

req.end();
