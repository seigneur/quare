import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("medication organization migration", () => {
  it("indexes existing dose and stock organizations without changing their records", () => {
    const database = new Database(":memory:");
    try {
      database.exec(readFileSync(
        new URL("../../migrations/0001_doses.sql", import.meta.url), "utf8"
      ));
      database.exec(`
        INSERT INTO doses
          (id, org_id, record_id, recipient_id, scheduled_at, created_at, updated_at)
        VALUES ('dose', 'dose-org', 'med-1', 'recipient', '2026-03-16T08:00:00.000Z',
                '2026-03-16T07:00:00.000Z', '2026-03-16T07:00:00.000Z');
        INSERT INTO medication_stock (record_id, org_id, quantity)
        VALUES ('med-1', 'dose-org', 10), ('med-2', 'stock-only-org', 5);
      `);
      database.exec(readFileSync(
        new URL("../../migrations/0002_medication_orgs.sql", import.meta.url), "utf8"
      ));
      expect(database.prepare("SELECT org_id FROM medication_orgs ORDER BY org_id").all())
        .toEqual([{ org_id: "dose-org" }, { org_id: "stock-only-org" }]);
      expect(database.prepare("SELECT COUNT(*) AS count FROM doses").get()).toEqual({ count: 1 });
      expect(database.prepare("SELECT SUM(quantity) AS quantity FROM medication_stock").get())
        .toEqual({ quantity: 15 });
    } finally {
      database.close();
    }
  });
});
