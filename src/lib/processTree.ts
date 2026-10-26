import { execFile } from 'node:child_process';

export function assertPid(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 1) {
    throw new Error(`Invalid process id: ${pid}`);
  }
}

export function windowsChildQuery(pid: number): { file: string; args: string[] } {
  assertPid(pid);
  return {
    file: 'powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | Select-Object -ExpandProperty ProcessId`,
    ],
  };
}

export function unixChildQuery(pid: number): { file: string; args: string[] } {
  assertPid(pid);
  return { file: 'pgrep', args: ['-P', String(pid)] };
}

export function parsePids(stdout: string): number[] {
  return stdout
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((pid) => Number.isInteger(pid) && pid > 1);
}

function execText(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 5000, encoding: 'utf8' }, (_error, stdout) => {
      resolve(typeof stdout === 'string' ? stdout : '');
    });
  });
}

async function childrenOf(pid: number): Promise<number[]> {
  const query = process.platform === 'win32' ? windowsChildQuery(pid) : unixChildQuery(pid);
  try {
    const stdout = await execText(query.file, query.args);
    return parsePids(stdout);
  } catch {
    return [];
  }
}

export async function killProcessTree(rootPid: number, options: { includeRoot: boolean }): Promise<void> {
  assertPid(rootPid);
  const seen = new Set<number>();
  const ordered: number[] = [];

  async function walk(pid: number): Promise<void> {
    if (seen.has(pid)) {
      return;
    }
    seen.add(pid);
    const kids = await childrenOf(pid);
    for (const kid of kids) {
      if (kid !== pid) {
        await walk(kid);
      }
    }
    ordered.push(pid);
  }

  await walk(rootPid);
  const victims = options.includeRoot ? ordered : ordered.filter((pid) => pid !== rootPid);
  for (const pid of victims) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // The process already exited.
    }
  }
}
