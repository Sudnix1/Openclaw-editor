-- Debug SQL to create status change logging

-- Create status change log table
CREATE TABLE IF NOT EXISTS keyword_status_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword_id TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    change_source TEXT DEFAULT 'unknown',
    FOREIGN KEY (keyword_id) REFERENCES keywords(id)
);

-- Create trigger to log all status changes
DROP TRIGGER IF EXISTS log_keyword_status_changes;

CREATE TRIGGER log_keyword_status_changes 
AFTER UPDATE OF status ON keywords
FOR EACH ROW
WHEN OLD.status != NEW.status
BEGIN
    INSERT INTO keyword_status_log (keyword_id, old_status, new_status, changed_at)
    VALUES (NEW.id, OLD.status, NEW.status, CURRENT_TIMESTAMP);
END;

-- Query to see recent status changes
-- SELECT ksl.*, k.keyword 
-- FROM keyword_status_log ksl
-- JOIN keywords k ON ksl.keyword_id = k.id
-- ORDER BY ksl.changed_at DESC
-- LIMIT 20;