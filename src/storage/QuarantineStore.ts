import { SecureStore } from './SecureStore.js';

interface QuarantineRecord {
  [id: string]: unknown;
}

export class QuarantineStore {
  private readonly store = new SecureStore<QuarantineRecord>('quarantineStore');

  public async getAll(): Promise<QuarantineRecord> {
    return this.store.load({});
  }

  public async remove(id: string): Promise<void> {
    const entries = await this.store.load({});
    if (!(id in entries)) {
      return;
    }
    delete entries[id];
    await this.store.save(entries);
  }
}
