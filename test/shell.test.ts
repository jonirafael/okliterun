import { describe, expect, it } from 'vitest';
import { terminalEnvironment } from '../src/lib/environment';
import {
  detectShellKind,
  inferShellFromProfileName,
  prefixRunMarker,
  resolveShellKind,
  shellCommandArgs,
} from '../src/lib/shell';

describe('detectShellKind', () => {
  it('reads the executable name', () => {
    expect(detectShellKind(String.raw`C:\Program Files\PowerShell\7\pwsh.exe`, 'win32')).toBe('pwsh');
    expect(detectShellKind(String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`, 'win32')).toBe('powershell');
    expect(detectShellKind(String.raw`C:\Windows\System32\cmd.exe`, 'win32')).toBe('cmd');
    expect(detectShellKind(String.raw`C:\Program Files\Git\bin\bash.exe`, 'win32')).toBe('bash');
    expect(detectShellKind('/bin/zsh', 'darwin')).toBe('zsh');
    expect(detectShellKind('/bin/bash', 'linux')).toBe('bash');
    expect(detectShellKind(String.raw`C:\Windows\System32\wsl.exe`, 'win32')).toBe('wsl');
  });

  it('falls back by platform when the path is unknown', () => {
    expect(detectShellKind(undefined, 'win32')).toBe('powershell');
    expect(detectShellKind(undefined, 'darwin')).toBe('zsh');
    expect(detectShellKind(undefined, 'linux')).toBe('bash');
  });
});

describe('resolveShellKind', () => {
  it('trusts an explicit profile path over the profile name', () => {
    expect(resolveShellKind({
      explicitShellPath: String.raw`C:\Program Files\Git\bin\bash.exe`,
      profileName: 'PowerShell',
      envShell: 'powershell.exe',
      platform: 'win32',
    })).toBe('bash');
  });

  it('maps built-in profile names when no path is configured', () => {
    expect(resolveShellKind({ profileName: 'Git Bash', platform: 'win32' })).toBe('bash');
    expect(resolveShellKind({ profileName: 'Command Prompt', platform: 'win32' })).toBe('cmd');
    expect(resolveShellKind({ profileName: 'PowerShell', platform: 'win32' })).toBe('powershell');
    expect(resolveShellKind({ profileName: 'PowerShell 7', platform: 'win32' })).toBe('pwsh');
    expect(resolveShellKind({ profileName: 'Ubuntu (WSL)', platform: 'win32' })).toBe('wsl');
    expect(inferShellFromProfileName('Windows PowerShell')).toBe('powershell');
  });

  it('uses vscode.env.shell when the profile is unset', () => {
    expect(resolveShellKind({
      envShell: '/bin/zsh',
      platform: 'linux',
    })).toBe('zsh');
  });
});

describe('shell command helpers', () => {
  it('marks a run without swallowing the rest of a cmd line', () => {
    expect(prefixRunMarker('cmd', 'echo hi', 'abc')).toBe('set "OKLITERUN_RUN=okliterunabc" >nul & echo hi');
    expect(prefixRunMarker('bash', 'echo hi', 'abc')).toBe(': okliterunabc; echo hi');
    expect(prefixRunMarker('pwsh', 'echo hi', 'abc')).toBe("$null = 'okliterunabc'; echo hi");
    expect(prefixRunMarker('cmd', 'echo hi', 'abc')).not.toMatch(/^rem\b/);
  });

  it('invokes a shell without a login flag', () => {
    expect(shellCommandArgs('bash', 'echo hi')).toEqual({ command: 'bash', args: ['-c', 'echo hi'] });
    expect(shellCommandArgs('cmd', 'echo hi').args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    expect(shellCommandArgs('powershell', 'echo hi').args).toContain('-NoProfile');
    expect(shellCommandArgs('pwsh', 'echo hi').command).toBe('pwsh');
    expect(shellCommandArgs('wsl', 'echo hi').args).toEqual(['-e', 'bash', '-c', 'echo hi']);
  });

  it('disables MSYS path conversion for Git Bash on Windows', () => {
    const env = terminalEnvironment({ platform: 'win32', shell: 'bash' });
    expect(env.MSYS_NO_PATHCONV).toBe('1');
    expect(env.MSYS2_ARG_CONV_EXCL).toBe('*');
    expect(env.PYTHONUNBUFFERED).toBe('1');
    expect(terminalEnvironment({ platform: 'linux', shell: 'bash' }).MSYS_NO_PATHCONV).toBeUndefined();
  });

  it('keeps an explicit Python encoding', () => {
    const env = terminalEnvironment({
      platform: 'linux',
      shell: 'bash',
      pythonEnv: { PYTHONIOENCODING: 'latin-1', VIRTUAL_ENV: '/venv' },
    });
    expect(env.PYTHONIOENCODING).toBe('latin-1');
    expect(env.PYTHONUNBUFFERED).toBe('1');
    expect(env.VIRTUAL_ENV).toBe('/venv');
  });
});
