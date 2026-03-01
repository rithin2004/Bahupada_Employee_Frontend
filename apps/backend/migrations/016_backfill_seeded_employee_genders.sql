-- Backfill gender for seeded employees:
-- Keep female packers as-is and set the rest to MALE.

UPDATE employees
SET gender = 'MALE'
WHERE lower(full_name) IN (
    'hari',
    'prakash',
    'vinod',
    'muneer',
    'shahul',
    'narayana',
    'prasad',
    'vijay',
    'altaf',
    'rabbani'
)
AND (gender IS NULL OR gender <> 'MALE');
