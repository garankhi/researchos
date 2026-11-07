-- Keep isolated queue prefixes from claiming one another's PostgreSQL jobs.
ALTER TABLE background_jobs ADD COLUMN queue_prefix varchar(128) NOT NULL DEFAULT 'researchos';
