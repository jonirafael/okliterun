import { describe, expect, it } from 'vitest';
import { installHint, notFoundMessage, typescriptMissingMessage, unsupportedMessage } from '../src/lib/messages';
import { pickTypescriptRunner, pythonCandidates, resolvePythonExecutable } from '../src/lib/resolveTools';
import { normalizeCwdMode, normalizeExecutorMap } from '../src/lib/settings';

describe('messages', () => {
  it('explains how to install a missing tool', () => {
    expect(notFoundMessage('gcc', 'C')).toMatch(/can't find "gcc"/);
    expect(notFoundMessage('gcc', 'C')).toMatch(/MinGW-w64/);
    expect(installHint(String.raw`C:\Python\python.exe`)).toMatch(/python.org/);
    expect(notFoundMessage('java', 'Java')).toMatch(/JDK 11/);
    expect(typescriptMissingMessage()).toMatch(/tsx/);
    expect(unsupportedMessage('ruby')).toMatch(/executorMap/);
  });
});

describe('tool resolution', () => {
  it('prefers a configured interpreter over the extension and PATH', async () => {
    const calls: string[] = [];
    const resolved = await resolvePythonExecutable({
      configured: '/custom/python',
      fromExtension: '/venv/bin/python',
      platform: 'linux',
      exists: async (command) => {
        calls.push(command);
        return true;
      },
    });
    expect(resolved).toBe('/custom/python');
    expect(calls).toEqual([]);
  });

  it('uses the extension interpreter when it exists', async () => {
    const resolved = await resolvePythonExecutable({
      fromExtension: '/venv/bin/python',
      platform: 'linux',
      exists: async (command) => command === '/venv/bin/python',
    });
    expect(resolved).toBe('/venv/bin/python');
  });

  it('falls through to python3 then python', async () => {
    expect(pythonCandidates('linux')).toEqual(['python3', 'python']);
    expect(pythonCandidates('win32')).toEqual(['python', 'python3', 'py']);
    const resolved = await resolvePythonExecutable({
      fromExtension: '/missing/python',
      platform: 'linux',
      exists: async (command) => command === 'python',
    });
    expect(resolved).toBe('python');
  });

  it('picks tsx before ts-node', () => {
    expect(pickTypescriptRunner({ tsx: true, tsNode: true })).toBe('tsx');
    expect(pickTypescriptRunner({ tsx: false, tsNode: true })).toBe('ts-node');
    expect(pickTypescriptRunner({ tsx: false, tsNode: false })).toBeUndefined();
  });
});

describe('settings normalization', () => {
  it('drops empty executor entries and unknown cwd values', () => {
    expect(normalizeExecutorMap({ python: '  ', ruby: 'ruby $file', bad: 1 })).toEqual({ ruby: 'ruby $file' });
    expect(normalizeExecutorMap(null)).toEqual({});
    expect(normalizeCwdMode('workspaceRoot')).toBe('workspaceRoot');
    expect(normalizeCwdMode('nope')).toBe('fileDir');
  });
});
