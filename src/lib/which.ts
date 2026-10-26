import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export function isPathLike(command: string): boolean {
  return (
    path.isAbsolute(command) ||
    command.includes('/') ||
    command.includes('\\') ||
    command.startsWith('.')
  );
}

export function wslWhichInvocation(command: string): { file: string; args: string[] } | undefined {
  if (!/^[A-Za-z0-9._+-]+$/.test(command)) {
    return undefined;
  }
  return { file: 'wsl.exe', args: ['-e', 'which', command] };
}

export async function commandExists(command: string): Promise<boolean> {
  if (!command || command.includes('\0') || /[\r\n]/.test(command)) {
    return false;
  }
  if (isPathLike(command)) {
    try {
      const stat = await fs.stat(command);
      return stat.isFile();
    } catch {
      return false;
    }
  }
  const locator = process.platform === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    execFile(locator, [command], { windowsHide: true, timeout: 8000 }, (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }
      resolve(Boolean(stdout && stdout.toString().trim().length > 0));
    });
  });
}
