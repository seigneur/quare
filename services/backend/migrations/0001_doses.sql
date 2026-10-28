CREATE TABLE doses (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'taken', 'missed', 'skipped', 'rescheduled')),
  taken_at TEXT,
  notes TEXT,
  source TEXT CHECK (source IN ('web', 'qr', 'mcp', 'alexa', 'telegram')),
  stock_deducted REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX doses_record_schedule ON doses (record_id, scheduled_at);
CREATE INDEX doses_org_schedule ON doses (org_id, scheduled_at);

-- D1 owns stock between explicit asset stock edits; KV is a retryable projection.
CREATE TABLE medication_stock (
  record_id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity >= 0)
);
CREATE INDEX medication_stock_org ON medication_stock (org_id);

CREATE TRIGGER dose_taken_stock AFTER UPDATE OF status ON doses
WHEN NEW.status = 'taken' AND OLD.status <> 'taken'
BEGIN
  UPDATE doses SET stock_deducted = COALESCE(
    (SELECT MIN(1, quantity) FROM medication_stock
     WHERE org_id = NEW.org_id AND record_id = NEW.record_id), 0
  ) WHERE id = NEW.id;
  UPDATE medication_stock SET quantity = MAX(0, quantity - 1)
  WHERE org_id = NEW.org_id AND record_id = NEW.record_id;
END;

CREATE TRIGGER dose_undo_stock AFTER UPDATE OF status ON doses
WHEN OLD.status = 'taken' AND NEW.status <> 'taken'
BEGIN
  UPDATE medication_stock SET quantity = quantity + OLD.stock_deducted
  WHERE org_id = NEW.org_id AND record_id = NEW.record_id;
  UPDATE doses SET stock_deducted = 0 WHERE id = NEW.id;
END;
