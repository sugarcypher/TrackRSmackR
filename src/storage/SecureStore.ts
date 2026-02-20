export class SecureStore<TValue> {
  public constructor(private readonly key: string) {}

  public async load(defaultValue: TValue): Promise<TValue> {
    const data = (await chrome.storage.local.get(this.key)) as Record<string, TValue | undefined>;
    return data[this.key] ?? defaultValue;
  }

  public async save(value: TValue): Promise<void> {
    await chrome.storage.local.set({ [this.key]: value as unknown });
  }
}
