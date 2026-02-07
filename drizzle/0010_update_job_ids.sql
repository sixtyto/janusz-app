-- Update job IDs to replace '/' with '--' for URL safety
-- This fixes 400 errors on production when accessing /api/jobs/[id]

UPDATE jobs
SET id = replace(id, '/', '--')
WHERE id LIKE '%/%';

-- Update log job_id references to match
UPDATE logs
SET job_id = replace(job_id, '/', '--')
WHERE job_id LIKE '%/%';
