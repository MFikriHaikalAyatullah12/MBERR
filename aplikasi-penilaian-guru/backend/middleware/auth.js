const jwt = require('jsonwebtoken');

// Use environment variable for JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-change-this';

// Warn if using fallback secret
if (!process.env.JWT_SECRET) {
    console.warn('WARNING: Using fallback JWT secret. Set JWT_SECRET in .env file for production!');
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.log('Token verification failed:', err.message);
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

function authorizeClass(req, res, next) {
    const classId = parseInt(req.params.classId || req.body.class_id);
    
    if (req.user.class_id !== classId) {
        return res.status(403).json({ error: 'Access denied to this class' });
    }
    
    next();
}

module.exports = { authenticateToken, authorizeClass, JWT_SECRET };
