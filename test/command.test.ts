import { describe, expect, it } from 'vitest';
import { buildCommand, firstExecutableToken, splitOnAnd, toShellPath, type BuildInput } from '../src/lib/command';
import { SUPPORTED_LANGUAGE_IDS } from '../src/lib/languages';
import { quoteArg } from '../src/lib/quote';
import { SHELL_KINDS } from '../src/lib/shell';

function input(overrides: Partial<BuildInput> & Pick<BuildInput, 'shell'>): BuildInput {
  return {
    languageId: 'python',
    filePath: '/home/ada/my project/main.py',
    cwd: '/home/ada/my project',
    workspaceRoot: '/home/ada',
    platform: 'linux',
    pythonPath: '/usr/bin/python3',
    typescriptRunner: 'tsx',
    shellScriptRunner: 'bash',
    powershellRunner: 'pwsh',
    executorMap: {},
    clearPreviousOutput: false,
    ...overrides,
  };
}

describe('buildCommand goldens', () => {
  it('builds a bash python command', () => {
    const plan = buildCommand(input({ shell: 'bash', clearPreviousOutput: true }));
    expect(plan.terminalCommand).toBe(
      "clear; cd '/home/ada/my project' && '/usr/bin/python3' '-u' '/home/ada/my project/main.py'",
    );
    expect(plan.directSteps).toEqual([['/usr/bin/python3', '-u', '/home/ada/my project/main.py']]);
    expect(plan.preflight).toEqual(['/usr/bin/python3']);
  });

  it('builds a cmd python command and quotes Program Files', () => {
    const plan = buildCommand(input({
      shell: 'cmd',
      platform: 'win32',
      filePath: String.raw`C:\Users\Ada Lovelace\main.py`,
      cwd: String.raw`C:\Users\Ada Lovelace`,
      pythonPath: String.raw`C:\Program Files\Python\python.exe`,
    }));
    expect(plan.terminalCommand).toBe(
      String.raw`chcp 65001 >nul & cd /d "C:\Users\Ada Lovelace" && "C:\Program Files\Python\python.exe" "-u" "C:\Users\Ada Lovelace\main.py"`,
    );
  });

  it('uses if ($LASTEXITCODE) for Windows PowerShell and && for pwsh', () => {
    const shared = {
      languageId: 'c',
      platform: 'win32' as const,
      filePath: String.raw`C:\src\file (1).c`,
      cwd: String.raw`C:\src`,
    };
    const powershell = buildCommand(input({ ...shared, shell: 'powershell' }));
    expect(powershell.terminalCommand).toBe(
      String.raw`Set-Location -LiteralPath 'C:\src'; if ($?) { & 'gcc' 'C:\src\file (1).c' '-o' 'C:\src\file (1).exe'; if ($LASTEXITCODE -eq 0) { & 'C:\src\file (1).exe' } }`,
    );
    expect(powershell.terminalCommand).not.toContain(' && ');
    const pwsh = buildCommand(input({ ...shared, shell: 'pwsh' }));
    expect(pwsh.terminalCommand).toBe(
      String.raw`Set-Location -LiteralPath 'C:\src' && & 'gcc' 'C:\src\file (1).c' '-o' 'C:\src\file (1).exe' && & 'C:\src\file (1).exe'`,
    );
  });

  it('converts Windows paths for a WSL terminal and does not append .exe', () => {
    const plan = buildCommand(input({
      shell: 'wsl',
      platform: 'win32',
      languageId: 'python',
      filePath: String.raw`C:\Users\Ada Lovelace\main.py`,
      cwd: String.raw`C:\Users\Ada Lovelace`,
      pythonPath: 'python3',
    }));
    expect(plan.terminalCommand).toBe(
      "cd '/mnt/c/Users/Ada Lovelace' && 'python3' '-u' '/mnt/c/Users/Ada Lovelace/main.py'",
    );
    const cPlan = buildCommand(input({
      shell: 'wsl',
      platform: 'win32',
      languageId: 'c',
      filePath: String.raw`C:\src\main.c`,
      cwd: String.raw`C:\src`,
    }));
    expect(cPlan.terminalCommand).toContain("'/mnt/c/src/main'");
    expect(cPlan.terminalCommand).not.toContain('.exe');
    expect(cPlan.directSteps?.[0]).toEqual(['gcc', String.raw`C:\src\main.c`, '-o', String.raw`C:\src\main.exe`]);
  });

  it('quotes a percent sign for cmd', () => {
    const plan = buildCommand(input({
      shell: 'cmd',
      platform: 'win32',
      filePath: String.raw`C:\100% done\main.py`,
      cwd: String.raw`C:\100% done`,
      pythonPath: 'py',
    }));
    expect(plan.terminalCommand).toBe(
      String.raw`chcp 65001 >nul & cd /d "C:\100"^%" done" && "py" "-u" "C:\100"^%" done\main.py"`,
    );
  });

  it('passes a drive root to cmd without a dangling quote', () => {
    const plan = buildCommand(input({
      shell: 'cmd',
      platform: 'win32',
      filePath: String.raw`C:\main.py`,
      cwd: 'C:\\',
      pythonPath: 'py',
    }));
    expect(plan.terminalCommand).toContain(String.raw`cd /d "C:\."`);
  });

  it('applies executorMap placeholders without double-quoting', () => {
    const plan = buildCommand(input({
      shell: 'bash',
      executorMap: { python: 'pytest -q $fileName' },
    }));
    expect(plan.terminalCommand).toBe("cd '/home/ada/my project' && pytest -q 'main.py'");
    expect(plan.directSteps).toBeUndefined();
    expect(plan.preflight).toEqual(['pytest']);
    expect(plan.shellCommand).toBe(plan.terminalCommand);
  });

  it('calls a quoted python path on Windows PowerShell', () => {
    const plan = buildCommand(input({
      shell: 'powershell',
      platform: 'win32',
      filePath: String.raw`C:\Users\A\main.py`,
      cwd: String.raw`C:\Users\A`,
      pythonPath: String.raw`C:\Program Files\Python\python.exe`,
      executorMap: { python: '$python -u $file' },
    }));
    expect(plan.terminalCommand).toBe(
      String.raw`Set-Location -LiteralPath 'C:\Users\A'; if ($?) { & 'C:\Program Files\Python\python.exe' -u 'C:\Users\A\main.py' }`,
    );
    expect(plan.preflight).toContain(String.raw`C:\Program Files\Python\python.exe`);
  });

  it('rewrites && in a custom Windows PowerShell command and does not preflight the output exe', () => {
    const plan = buildCommand(input({
      shell: 'powershell',
      platform: 'win32',
      languageId: 'c',
      filePath: String.raw`C:\src\a.c`,
      cwd: String.raw`C:\src`,
      executorMap: { c: 'gcc $file -o $exe && $exe' },
    }));
    expect(plan.shellCommand).toBe(
      String.raw`Set-Location -LiteralPath 'C:\src'; if ($?) { gcc 'C:\src\a.c' -o 'C:\src\a.exe'; if ($LASTEXITCODE -eq 0) { & 'C:\src\a.exe' } }`,
    );
    expect(plan.preflight).toEqual(['gcc']);
  });

  it('rejects newlines in paths', () => {
    expect(() => buildCommand(input({ shell: 'bash', filePath: '/tmp/a\nb.py' }))).toThrow(/newline/);
  });

  it('names the missing TypeScript runner', () => {
    expect(() => buildCommand(input({
      shell: 'bash',
      languageId: 'typescript',
      filePath: '/tmp/main.ts',
      cwd: '/tmp',
      typescriptRunner: undefined,
    }))).toThrow(/tsx or ts-node/);
  });
});

describe('quoting across shells and languages', () => {
  const nasty = '/home/ada/my project/café (1) $x \'quote\' & co/main.py';

  it('quotes the file path for every built-in language and shell', () => {
    for (const languageId of SUPPORTED_LANGUAGE_IDS) {
      for (const shell of SHELL_KINDS) {
        const platform = shell === 'cmd' || shell === 'powershell' || shell === 'pwsh' ? 'win32' : 'linux';
        const filePath = platform === 'win32'
          ? String.raw`C:\Users\Ada Lovelace\café (1)\main` + extensionFor(languageId)
          : nasty.replace(/main\.py$/, `main${extensionFor(languageId)}`);
        const cwd = platform === 'win32' ? String.raw`C:\Users\Ada Lovelace\café (1)` : '/home/ada/my project/café (1) $x \'quote\' & co';
        const plan = buildCommand(input({
          shell,
          platform,
          languageId,
          filePath,
          cwd,
          workspaceRoot: platform === 'win32' ? String.raw`C:\Users\Ada Lovelace` : '/home/ada',
        }));
        const shellFile = toShellPath(filePath, shell);
        const quoted = quoteArg(shellFile, shell);
        expect(plan.terminalCommand, `${languageId}/${shell}`).toContain(quoted);
        const stripped = plan.terminalCommand.split(quoted).join('');
        expect(stripped, `${languageId}/${shell}`).not.toContain(shellFile);
        if (shell === 'powershell') {
          expect(plan.terminalCommand, languageId).not.toContain(' && ');
        }
      }
    }
  });
});

describe('splitOnAnd', () => {
  it('does not split inside quotes', () => {
    expect(splitOnAnd("echo 'a && b' && echo c")).toEqual(["echo 'a && b'", 'echo c']);
    expect(splitOnAnd("gcc 'C:\\src\\a && b.c' -o 'C:\\src\\a && b' && 'C:\\src\\a && b'")).toEqual([
      "gcc 'C:\\src\\a && b.c' -o 'C:\\src\\a && b'",
      "'C:\\src\\a && b'",
    ]);
    expect(splitOnAnd('foo&&bar')).toEqual(['foo&&bar']);
  });

  it('reads a quoted executable', () => {
    expect(firstExecutableToken("'C:\\Program Files\\python.exe' -u 'main.py'")).toBe(String.raw`C:\Program Files\python.exe`);
    expect(firstExecutableToken("& 'gcc' 'main.c'")).toBe('gcc');
    expect(firstExecutableToken('pytest -q main.py')).toBe('pytest');
  });
});

function extensionFor(languageId: string): string {
  switch (languageId) {
    case 'python':
      return '.py';
    case 'javascript':
      return '.js';
    case 'typescript':
      return '.ts';
    case 'typescriptreact':
      return '.tsx';
    case 'c':
      return '.c';
    case 'cpp':
      return '.cpp';
    case 'java':
      return '.java';
    case 'go':
      return '.go';
    case 'php':
      return '.php';
    case 'shellscript':
      return '.sh';
    case 'powershell':
      return '.ps1';
    default:
      return '.txt';
  }
}
