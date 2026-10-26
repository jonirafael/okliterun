import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { prepareCmdArgument, quoteArg, quoteCmd, quotePosix, quotePowerShell } from '../src/lib/quote';

const samples = [
  'simple',
  'has space',
  "has'quote",
  'has"quote',
  'café 文件',
  'file (1)',
  'price$5',
  '100%done',
  'bang!now',
  'a&b',
  'a;b',
  'caret^up',
  'tick`back',
  'hash#tag',
  'star*',
  '',
  'line1\nline2',
  String.raw`C:\Program Files\app\main.py`,
  '/home/user/my project/main.py',
  String.raw`C:\Users\O'Brien\file (1)\100% done\main.py`,
];

function commandExists(command: string): boolean {
  try {
    execFileSync('which', [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('posix quoting', () => {
  it('wraps values in single quotes and escapes apostrophes', () => {
    expect(quotePosix('hello')).toBe("'hello'");
    expect(quotePosix("O'Brien")).toBe(`'O'\\''Brien'`);
    expect(quotePosix('')).toBe("''");
    expect(quotePosix('café (1) $HOME')).toBe("'café (1) $HOME'");
  });

  it('round-trips through bash', () => {
    for (const sample of samples) {
      const quoted = quotePosix(sample);
      const printed = execFileSync('bash', ['-c', `printf '%s' ${quoted}`], { encoding: 'utf8' });
      expect(printed).toBe(sample);
    }
  });

  it('round-trips through zsh when zsh is installed', () => {
    if (!commandExists('zsh')) {
      return;
    }
    for (const sample of samples) {
      const quoted = quoteArg(sample, 'zsh');
      const printed = execFileSync('zsh', ['-c', `printf '%s' ${quoted}`], { encoding: 'utf8' });
      expect(printed).toBe(sample);
    }
  });
});

describe('PowerShell quoting', () => {
  it('doubles apostrophes inside single quotes', () => {
    expect(quotePowerShell('hello')).toBe("'hello'");
    expect(quotePowerShell("O'Brien")).toBe("'O''Brien'");
    expect(quotePowerShell('price$5 (1)')).toBe("'price$5 (1)'");
    expect(quotePowerShell('café & "x"')).toBe(`'café & "x"'`);
  });

  it('uses the same quoting for pwsh and powershell', () => {
    for (const sample of samples) {
      expect(quoteArg(sample, 'pwsh')).toBe(quoteArg(sample, 'powershell'));
    }
  });

  it('round-trips through pwsh when PowerShell 7 is installed', () => {
    if (!commandExists('pwsh')) {
      return;
    }
    for (const sample of samples) {
      const quoted = quoteArg(sample, 'pwsh');
      const script = `& { param($x) [Console]::Out.Write($x) } ${quoted}`;
      const printed = execFileSync('pwsh', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
      expect(printed).toBe(sample);
    }
  });
});

describe('cmd quoting', () => {
  it('double-quotes spaces, parentheses, unicode, and ampersands', () => {
    expect(quoteCmd('simple')).toBe('"simple"');
    expect(quoteCmd(String.raw`C:\Program Files\app\main.py`)).toBe(String.raw`"C:\Program Files\app\main.py"`);
    expect(quoteCmd(String.raw`C:\file (1)\main.py`)).toBe(String.raw`"C:\file (1)\main.py"`);
    expect(quoteCmd('café 文件')).toBe('"café 文件"');
    expect(quoteCmd('a&b|c')).toBe('"a&b|c"');
    expect(quoteCmd('')).toBe('""');
  });

  it('caret-escapes percent and exclamation outside quotes', () => {
    expect(quoteCmd(String.raw`C:\100% done\main.py`)).toBe(String.raw`"C:\100"^%" done\main.py"`);
    expect(quoteCmd('hello!')).toBe(`"hello"^!""`);
    expect(quoteCmd('a!b')).toBe(`"a"^!"b"`);
  });

  it('doubles embedded quotes', () => {
    expect(quoteCmd(String.raw`C:\a"b\main.py`)).toBe(String.raw`"C:\a""b\main.py"`);
  });

  it('keeps a trailing backslash from escaping the closing quote', () => {
    expect(prepareCmdArgument('C:\\')).toBe('C:\\.');
    expect(quoteCmd('C:\\')).toBe('"C:\\."');
    expect(quoteCmd('C:\\temp\\')).toBe('"C:\\temp"');
  });
});
