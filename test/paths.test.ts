import { describe, expect, it } from 'vitest';
import {
  basenameOf,
  dirnameOf,
  fileNameNoExt,
  resolveWorkingDirectory,
  stripExtension,
  windowsPathToWsl,
  wslPathToWindows,
} from '../src/lib/paths';

describe('path pieces', () => {
  it('splits posix and windows paths', () => {
    expect(dirnameOf('/home/ada/my project/main.py')).toBe('/home/ada/my project');
    expect(basenameOf('/home/ada/my project/main.py')).toBe('main.py');
    expect(stripExtension('/home/ada/my project/main.py')).toBe('/home/ada/my project/main');
    expect(fileNameNoExt('/home/ada/my project/main.py')).toBe('main');

    expect(dirnameOf(String.raw`C:\src\file (1)\main.cpp`)).toBe(String.raw`C:\src\file (1)`);
    expect(basenameOf(String.raw`C:\src\file (1)\main.cpp`)).toBe('main.cpp');
    expect(stripExtension(String.raw`C:\src\file (1)\main.cpp`)).toBe(String.raw`C:\src\file (1)\main`);
  });

  it('keeps a windows drive root', () => {
    expect(dirnameOf(String.raw`C:\main.c`)).toBe('C:\\');
    expect(dirnameOf('/main.c')).toBe('/');
  });

  it('does not treat a leading dot as an extension', () => {
    expect(stripExtension('/home/ada/.gitignore')).toBe('/home/ada/.gitignore');
  });

  it('converts drive paths to WSL mounts', () => {
    expect(windowsPathToWsl(String.raw`C:\Users\Ada Lovelace\main.py`)).toBe('/mnt/c/Users/Ada Lovelace/main.py');
    expect(windowsPathToWsl('D:\\')).toBe('/mnt/d/');
    expect(windowsPathToWsl('python3')).toBe('python3');
    expect(wslPathToWindows('/mnt/c/Users/Ada Lovelace/main.py')).toBe(String.raw`C:\Users\Ada Lovelace\main.py`);
    expect(wslPathToWindows('/usr/bin/python3')).toBeUndefined();
  });
});

describe('resolveWorkingDirectory', () => {
  it('uses the file directory by default', () => {
    expect(resolveWorkingDirectory({
      mode: 'fileDir',
      sourceDir: '/proj/pkg',
      workspaceRoot: '/proj',
      fallbackDir: '/tmp/fallback',
    })).toEqual({ cwd: '/proj/pkg' });
  });

  it('uses the workspace root when asked', () => {
    expect(resolveWorkingDirectory({
      mode: 'workspaceRoot',
      sourceDir: '/proj/pkg',
      workspaceRoot: '/proj',
      fallbackDir: '/tmp/fallback',
    })).toEqual({ cwd: '/proj' });
  });

  it('falls back when there is no workspace', () => {
    const result = resolveWorkingDirectory({
      mode: 'workspaceRoot',
      sourceDir: '/proj/pkg',
      fallbackDir: '/tmp/fallback',
    });
    expect(result.cwd).toBe('/proj/pkg');
    expect(result.notice).toMatch(/workspace root/i);
  });

  it('uses the workspace for an untitled file', () => {
    const result = resolveWorkingDirectory({
      mode: 'fileDir',
      workspaceRoot: '/proj',
      fallbackDir: '/tmp/okliterun/run',
    });
    expect(result.cwd).toBe('/proj');
    expect(result.notice).toMatch(/has not been saved/i);
  });
});
