import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

class SQLiteStatement {
  constructor(
    private readonly database: Database.Database,
    private readonly query: string,
    private readonly values: unknown[] = []
  ) {}

  bind(...values: unknown[]): SQLiteStatement {
    return new SQLiteStatement(this.database, this.query, values);
  }

  execute<T = Record<string, unknown>>(): D1Result<T> {
    const statement = this.database.prepare(this.query);
    const before = this.database.prepare("SELECT total_changes() AS total").get() as { total: number };
    let results: T[] = [];
    if (statement.reader) {
      results = statement.all(...this.values) as T[];
    } else {
      statement.run(...this.values);
    }
    const after = this.database.prepare(
      "SELECT total_changes() AS total, last_insert_rowid() AS last_row_id"
    ).get() as { total: number; last_row_id: number };
    const changes = after.total - before.total;
    return {
      success: true,
      results,
      meta: {
        duration: 0,
        changes,
        last_row_id: Number(after.last_row_id),
        changed_db: changes > 0,
        size_after: Number(this.database.pragma("page_count", { simple: true }))
          * Number(this.database.pragma("page_size", { simple: true })),
        rows_read: results.length,
        rows_written: changes,
      },
    };
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.execute<Record<string, unknown>>().results[0];
    if (!row) return null;
    if (column !== undefined && !(column in row)) {
      throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${column})`);
    }
    return (column === undefined ? row : row[column]) as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }
}

export class SQLiteD1 {
  private readonly database = new Database(":memory:");

  constructor() {
    this.database.exec(readFileSync(
      new URL("../../migrations/0001_doses.sql", import.meta.url),
      "utf8"
    ));
  }

  prepare(query: string): SQLiteStatement {
    return new SQLiteStatement(this.database, query);
  }

  async batch<T = Record<string, unknown>>(statements: SQLiteStatement[]): Promise<D1Result<T>[]> {
    return this.database.transaction(
      () => statements.map((statement) => statement.execute<T>())
    )();
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.database.exec(query);
    return { count: query.split(";").filter((statement) => statement.trim()).length, duration: 0 };
  }

  close(): void {
    this.database.close();
  }
}
