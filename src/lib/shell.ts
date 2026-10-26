import { quoteArg } from './quote';

export const SHELL_KINDS = ['bash', 'zsh', 'pwsh', 'powershell', 'cmd', 'wsl'] as const;

export type ShellKind = (typeof SHELL_KINDS)[number];

export function detectShellKind(shellPath: string | undefined, platform: NodeJS.Platform): ShellKind {
  const raw = (shellPath ?? '').trim();
  const base = raw.split(/[/\\]/).pop()?.toLowerCase() ?? '';
  const name = base.replace(/\.exe$/i, '');
  if (name === 'pwsh' || name === 'pwsh-preview') {
    return 'pwsh';
  }
  if (name === 'powershell' || name === 'powershell_ise') {
    return 'powershell';
  }
  if (name === 'cmd') {
    return 'cmd';
  }
  if (name === 'wsl') {
    return 'wsl';
  }
  if (name === 'zsh') {
    return 'zsh';
  }
  if (name === 'bash' || name === 'sh' || name === 'dash' || name === 'git-bash') {
    return 'bash';
  }
  if (platform === 'win32') {
    return 'powershell';
  }
  if (platform === 'darwin') {
    return 'zsh';
  }
  return 'bash';
}

export function inferShellFromProfileName(name: string | undefined): ShellKind | undefined {
  if (!name) {
    return undefined;
  }
  const key = name.trim().toLowerCase();
  const table: Record<string, ShellKind> = {
    powershell: 'powershell',
    'windows powershell': 'powershell',
    'powershell 7': 'pwsh',
    pwsh: 'pwsh',
    'command prompt': 'cmd',
    cmd: 'cmd',
    'git bash': 'bash',
    bash: 'bash',
    zsh: 'zsh',
    wsl: 'wsl',
    ubuntu: 'wsl',
    'ubuntu (wsl)': 'wsl',
  };
  return table[key];
}

/**
 * Pick the shell OkLiteRun should quote for.
 * An explicit profile path wins. A profile name is used when the path is unset
 * (built-in profiles such as "Git Bash"). `vscode.env.shell` is the fallback.
 * The generic profile name "PowerShell" stays on Windows PowerShell syntax,
 * which also runs on PowerShell 7. `&&` is used only when the executable is pwsh.
 */
export function resolveShellKind(input: {
  explicitShellPath?: string;
  envShell?: string;
  profileName?: string;
  platform: NodeJS.Platform;
}): ShellKind {
  if (input.explicitShellPath?.trim()) {
    return detectShellKind(input.explicitShellPath, input.platform);
  }
  const inferred = inferShellFromProfileName(input.profileName);
  if (inferred) {
    return inferred;
  }
  if (input.envShell?.trim()) {
    return detectShellKind(input.envShell, input.platform);
  }
  return detectShellKind(undefined, input.platform);
}

/** A harmless prefix so shell-integration events can be matched to this run. */
export function prefixRunMarker(shell: ShellKind, command: string, token: string): string {
  if (!/^[A-Za-z0-9]+$/.test(token)) {
    throw new Error('Invalid run token');
  }
  const marker = `okliterun${token}`;
  switch (shell) {
    case 'cmd':
      return `set "OKLITERUN_RUN=${marker}" >nul & ${command}`;
    case 'powershell':
    case 'pwsh':
      return `$null = '${marker}'; ${command}`;
    default:
      return `: ${marker}; ${command}`;
  }
}

export function shellCommandArgs(shell: ShellKind, command: string): { command: string; args: string[] } {
  switch (shell) {
    case 'cmd':
      return { command: 'cmd.exe', args: ['/d', '/s', '/c', command] };
    case 'powershell':
      return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', command] };
    case 'pwsh':
      return { command: 'pwsh', args: ['-NoProfile', '-NonInteractive', '-Command', command] };
    case 'wsl':
      return { command: 'wsl.exe', args: ['-e', 'bash', '-c', command] };
    case 'zsh':
      return { command: 'zsh', args: ['-c', command] };
    default:
      return { command: 'bash', args: ['-c', command] };
  }
}

export function renderArgv(argv: readonly string[], shell: ShellKind): string {
  const quoted = argv.map((arg) => quoteArg(arg, shell));
  if (shell === 'powershell' || shell === 'pwsh') {
    return `& ${quoted.join(' ')}`;
  }
  return quoted.join(' ');
}
