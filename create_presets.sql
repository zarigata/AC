CREATE TABLE IF NOT EXISTS presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  configTemplate TEXT NOT NULL,
  icon TEXT,
  category TEXT,
  isSystem INTEGER NOT NULL DEFAULT 0,
  isFeatured INTEGER NOT NULL DEFAULT 0,
  orderIndex INTEGER NOT NULL DEFAULT 0,
  tags TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_presets_name ON presets(name);
CREATE INDEX IF NOT EXISTS idx_presets_category ON presets(category);
CREATE INDEX IF NOT EXISTS idx_presets_enabled ON presets(enabled);
CREATE INDEX IF NOT EXISTS idx_presets_system ON presets(isSystem);
CREATE INDEX IF NOT EXISTS idx_presets_featured ON presets(isFeatured);
CREATE INDEX IF NOT EXISTS idx_presets_order ON presets(orderIndex);