CREATE TABLE medication_orgs (
  org_id TEXT PRIMARY KEY NOT NULL
);

INSERT OR IGNORE INTO medication_orgs (org_id)
SELECT org_id FROM doses
UNION
SELECT org_id FROM medication_stock;
