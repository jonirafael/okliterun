export const SUPPORTED_LANGUAGE_IDS = [
  'python',
  'javascript',
  'typescript',
  'typescriptreact',
  'c',
  'cpp',
  'java',
  'go',
  'php',
  'shellscript',
  'powershell',
] as const;

export type SupportedLanguageId = (typeof SUPPORTED_LANGUAGE_IDS)[number];

const EXTENSIONS: Record<string, readonly string[]> = {
  python: ['.py', '.pyw'],
  javascript: ['.js', '.mjs', '.cjs'],
  typescript: ['.ts', '.mts', '.cts'],
  typescriptreact: ['.tsx'],
  c: ['.c'],
  cpp: ['.cpp', '.cc', '.cxx', '.c++'],
  java: ['.java'],
  go: ['.go'],
  php: ['.php'],
  shellscript: ['.sh', '.bash'],
  powershell: ['.ps1'],
};

/** Keys users may put in executorMap that should match a built-in language id. */
export const LANGUAGE_ALIASES: Record<string, string> = {
  'c++': 'cpp',
  ts: 'typescript',
  js: 'javascript',
  sh: 'shellscript',
  shell: 'shellscript',
  ps1: 'powershell',
};

export function isBuiltinLanguage(languageId: string): languageId is SupportedLanguageId {
  return (SUPPORTED_LANGUAGE_IDS as readonly string[]).includes(languageId);
}

export function defaultExtension(languageId: string): string {
  return EXTENSIONS[languageId]?.[0] ?? '.txt';
}

export function hasLanguageExtension(languageId: string, baseName: string): boolean {
  const known = EXTENSIONS[languageId];
  if (!known) {
    return false;
  }
  const dot = baseName.lastIndexOf('.');
  if (dot <= 0) {
    return false;
  }
  return known.includes(baseName.slice(dot).toLowerCase());
}

export function languageDisplayName(languageId: string): string {
  switch (languageId) {
    case 'python':
      return 'Python';
    case 'javascript':
      return 'JavaScript';
    case 'typescript':
    case 'typescriptreact':
      return 'TypeScript';
    case 'c':
      return 'C';
    case 'cpp':
      return 'C++';
    case 'java':
      return 'Java';
    case 'go':
      return 'Go';
    case 'php':
      return 'PHP';
    case 'shellscript':
      return 'Shell';
    case 'powershell':
      return 'PowerShell';
    default:
      return languageId;
  }
}

export function lookupExecutor(map: Record<string, string>, languageId: string): string | undefined {
  const keys = [languageId];
  if (languageId === 'typescriptreact') {
    keys.push('typescript');
  }
  if (languageId === 'javascriptreact') {
    keys.push('javascript');
  }
  for (const [alias, canonical] of Object.entries(LANGUAGE_ALIASES)) {
    if (canonical === languageId) {
      keys.push(alias);
    }
  }
  for (const key of keys) {
    const value = map[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}
