-- Clean up duplicate subjects
DELETE FROM subjects 
WHERE id NOT IN (
    SELECT MIN(id) 
    FROM subjects 
    GROUP BY name, class_id
);

-- Reset auto increment
DELETE FROM sqlite_sequence WHERE name='subjects';
INSERT INTO sqlite_sequence (name, seq) VALUES ('subjects', (SELECT MAX(id) FROM subjects));
