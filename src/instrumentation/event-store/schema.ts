export const CREATE_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    version INTEGER NOT NULL,
    entity_id TEXT NULL,
    actor TEXT NULL,
    correlation_id TEXT NULL,
    payload_json TEXT NOT NULL,
    metadata_json TEXT NULL
  );
`;

export const CREATE_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);",
  "CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);",
  "CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);",
  "CREATE INDEX IF NOT EXISTS idx_events_entity_id ON events(entity_id);",
  "CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);",
];
