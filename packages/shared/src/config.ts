// ─── Configuration ───────────────────────────────────────────

export type ConfigChangeHandler = (changes: Record<string, unknown>) => Promise<void>;

export interface ConfigSource {
  name: string;
  load(): Promise<Record<string, unknown>>;
  watch?(handler: ConfigChangeHandler): void;
}
