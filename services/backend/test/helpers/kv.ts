/**
 * In-memory KVNamespace implementation for tests.
 * Implements the subset of the KV API used by the Worker source.
 */
export class MemoryKV {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list({ prefix }: { prefix?: string } = {}): Promise<{
    keys: Array<{ name: string }>;
  }> {
    const keys = [...this.store.keys()]
      .filter((k) => !prefix || k.startsWith(prefix))
      .map((name) => ({ name }));
    return { keys };
  }

  /** Test helper — wipe all entries between tests */
  clear(): void {
    this.store.clear();
  }

  /** Test helper — read raw stored value */
  raw(key: string): string | undefined {
    return this.store.get(key);
  }
}
