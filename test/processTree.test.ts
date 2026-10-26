import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { killProcessTree, parsePids, unixChildQuery, windowsChildQuery } from '../src/lib/processTree';

describe('process tree queries', () => {
  it('rejects pids that are not safe to interpolate', () => {
    expect(() => windowsChildQuery(0)).toThrow(/Invalid process id/);
    expect(() => windowsChildQuery(1.5)).toThrow(/Invalid process id/);
    expect(() => unixChildQuery(-1)).toThrow(/Invalid process id/);
  });

  it('builds a child-process query that cannot chain extra commands', () => {
    const query = windowsChildQuery(4321);
    expect(query.args.join(' ')).toContain('ParentProcessId=4321');
    expect(query.args.join(' ')).not.toContain(';');
    expect(unixChildQuery(4321)).toEqual({ file: 'pgrep', args: ['-P', '4321'] });
    expect(parsePids('12\n34\nnope\n1\n')).toEqual([12, 34]);
  });

  it('kills a process and its descendants', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    const pid = child.pid;
    expect(pid).toBeGreaterThan(1);
    await killProcessTree(pid as number, { includeRoot: true });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(alive(pid as number)).toBe(false);
  });
});

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
