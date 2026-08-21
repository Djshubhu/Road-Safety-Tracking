PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  location_name TEXT,
  address TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical','moderate','low')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','assigned','in_progress','resolved')),
  reporter_name TEXT,
  is_anonymous INTEGER NOT NULL DEFAULT 1,
  image_key TEXT,
  image_content_type TEXT,
  assigned_to TEXT,
  resolution_note TEXT,
  upvotes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_events (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT,
  message TEXT,
  actor TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS votes (
  report_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (report_id, visitor_id),
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reports_priority ON reports(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_report ON report_events(report_id, created_at ASC);
