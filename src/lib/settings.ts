export type CwdMode = 'fileDir' | 'workspaceRoot';

export function normalizeCwdMode(value: unknown): CwdMode {
  return value === 'workspaceRoot' ? 'workspaceRoot' : 'fileDir';
}

export function normalizeExecutorMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string' && entry.trim()) {
      out[key] = entry;
    }
  }
  return out;
}

export function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
