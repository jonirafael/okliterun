import { lookupExecutor } from './languages';
import { newlinePathMessage, notFoundMessage, RunError, typescriptMissingMessage, unsupportedMessage } from './messages';
import {
  basenameOf,
  dirnameOf,
  fileNameNoExt,
  hasNewline,
  stripExtension,
  windowsPathToWsl,
} from './paths';
import { quoteArg } from './quote';
import { renderArgv, type ShellKind } from './shell';

export interface BuildInput {
  languageId: string;
  filePath: string;
  cwd: string;
  workspaceRoot?: string;
  shell: ShellKind;
  platform: NodeJS.Platform;
  pythonPath: string;
  typescriptRunner?: string;
  shellScriptRunner: string;
  powershellRunner: string;
  executorMap: Record<string, string>;
  clearPreviousOutput: boolean;
}

export interface RunPlan {
  cwd: string;
  /** Command typed into the integrated terminal, including an optional clear. */
  terminalCommand: string;
  /** Built-in commands run without a shell in output-channel mode. Host paths, not shell-converted. */
  directSteps?: string[][];
  /** Custom commands. Includes `cd`, omits the terminal clear. */
  shellCommand?: string;
  /** Executables that must exist on the host before the run starts. */
  preflight: string[];
}

const PLACEHOLDER_RE = /\$(fileNameNoExt|fileNoExt|fileName|workspaceRoot|python|file|dir|exe)\b/g;

export function buildCommand(input: BuildInput): RunPlan {
  if (hasNewline(input.filePath) || hasNewline(input.cwd) || hasNewline(input.workspaceRoot) || hasNewline(input.pythonPath)) {
    throw new RunError(newlinePathMessage());
  }

  const template = lookupExecutor(input.executorMap, input.languageId);
  if (template) {
    return buildCustom(input, template);
  }
  return buildBuiltin(input);
}

function buildBuiltin(input: BuildInput): RunPlan {
  const host = stepsFor(input, 'host');
  const terminal = stepsFor(input, 'terminal');
  if (!host || !terminal) {
    throw new RunError(unsupportedMessage(input.languageId));
  }
  const program = joinWithAnd(terminal.steps.map((argv) => renderArgv(argv, input.shell)), input.shell);
  return {
    cwd: input.cwd,
    terminalCommand: wrapWithCwd(input.shell, terminal.cwd, program, input.clearPreviousOutput),
    directSteps: host.steps,
    preflight: host.preflight,
  };
}

function buildCustom(input: BuildInput, template: string): RunPlan {
  const vars = pathVars(input, 'terminal');
  if (template.includes('$python') && !input.pythonPath.trim()) {
    throw new RunError(notFoundMessage('python', 'Python'));
  }
  const expanded = expandPlaceholders(template, vars, input.shell);
  const program = prepareUserProgram(expanded, input.shell);
  const preflight = preflightFromCustom(program, vars.exe);
  if (template.includes('$python') && input.pythonPath.trim()) {
    preflight.unshift(input.pythonPath);
  }
  const shellCwd = toShellPath(input.cwd, input.shell);
  return {
    cwd: input.cwd,
    terminalCommand: wrapWithCwd(input.shell, shellCwd, program, input.clearPreviousOutput),
    shellCommand: wrapWithCwd(input.shell, shellCwd, program, false),
    preflight,
  };
}

interface StepSet {
  steps: string[][];
  preflight: string[];
  cwd: string;
}

function stepsFor(input: BuildInput, target: 'host' | 'terminal'): StepSet | undefined {
  const file = target === 'terminal' ? toShellPath(input.filePath, input.shell) : input.filePath;
  const python = target === 'terminal' ? toShellPath(input.pythonPath, input.shell) : input.pythonPath;
  const exe = executableOutputPath(input.filePath, input.platform, input.shell, target);
  const cwd = target === 'terminal' ? toShellPath(input.cwd, input.shell) : input.cwd;
  const lang = input.languageId;

  switch (lang) {
    case 'python':
      if (!input.pythonPath.trim()) {
        throw new RunError(notFoundMessage('python', 'Python'));
      }
      return { steps: [[python, '-u', file]], preflight: [input.pythonPath], cwd };
    case 'javascript':
      return { steps: [['node', file]], preflight: ['node'], cwd };
    case 'typescript':
    case 'typescriptreact': {
      if (!input.typescriptRunner) {
        throw new RunError(typescriptMissingMessage());
      }
      const runner = target === 'terminal' ? toShellPath(input.typescriptRunner, input.shell) : input.typescriptRunner;
      return { steps: [[runner, file]], preflight: [input.typescriptRunner], cwd };
    }
    case 'c':
      return { steps: [['gcc', file, '-o', exe], [exe]], preflight: ['gcc'], cwd };
    case 'cpp':
      return { steps: [['g++', file, '-o', exe], [exe]], preflight: ['g++'], cwd };
    case 'java':
      return { steps: [['java', file]], preflight: ['java'], cwd };
    case 'go':
      return { steps: [['go', 'run', file]], preflight: ['go'], cwd };
    case 'php':
      return { steps: [['php', file]], preflight: ['php'], cwd };
    case 'shellscript':
      return { steps: [[input.shellScriptRunner, file]], preflight: [input.shellScriptRunner], cwd };
    case 'powershell':
      return {
        steps: [[input.powershellRunner, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file]],
        preflight: [input.powershellRunner],
        cwd,
      };
    default:
      return undefined;
  }
}

export function executableOutputPath(
  filePath: string,
  platform: NodeJS.Platform,
  shell: ShellKind,
  target: 'host' | 'terminal',
): string {
  if (target === 'terminal' && shell === 'wsl') {
    return stripExtension(windowsPathToWsl(filePath));
  }
  const noExt = stripExtension(filePath);
  if (platform === 'win32') {
    return `${noExt}.exe`;
  }
  return noExt;
}

export function toShellPath(filePath: string, shell: ShellKind): string {
  if (shell === 'wsl') {
    return windowsPathToWsl(filePath);
  }
  return filePath;
}

interface PathVars {
  file: string;
  fileNoExt: string;
  dir: string;
  fileName: string;
  fileNameNoExt: string;
  exe: string;
  workspaceRoot: string;
  python: string;
}

function pathVars(input: BuildInput, target: 'host' | 'terminal'): PathVars {
  const file = target === 'terminal' ? toShellPath(input.filePath, input.shell) : input.filePath;
  const workspace = input.workspaceRoot
    ? target === 'terminal'
      ? toShellPath(input.workspaceRoot, input.shell)
      : input.workspaceRoot
    : '';
  const python = target === 'terminal' ? toShellPath(input.pythonPath, input.shell) : input.pythonPath;
  return {
    file,
    fileNoExt: stripExtension(file),
    dir: dirnameOf(file),
    fileName: basenameOf(file),
    fileNameNoExt: fileNameNoExt(file),
    exe: executableOutputPath(input.filePath, input.platform, input.shell, target),
    workspaceRoot: workspace,
    python,
  };
}

export function expandPlaceholders(template: string, vars: PathVars, shell: ShellKind): string {
  return template.replace(PLACEHOLDER_RE, (_match, key: keyof PathVars) => quoteArg(vars[key] ?? '', shell));
}

export function splitOnAnd(command: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? '';
    if (quote) {
      buf += ch;
      if (ch === quote) {
        if (command[i + 1] === quote) {
          buf += command[i + 1];
          i++;
          continue;
        }
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      buf += ch;
      continue;
    }
    if (command.startsWith(' && ', i)) {
      parts.push(buf);
      buf = '';
      i += 3;
      continue;
    }
    buf += ch;
  }
  parts.push(buf);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

export function joinWithAnd(segments: string[], shell: ShellKind): string {
  if (segments.length === 0) {
    return '';
  }
  if (segments.length === 1) {
    return segments[0] ?? '';
  }
  if (shell === 'powershell') {
    let command = segments[0] ?? '';
    for (let i = 1; i < segments.length; i++) {
      command += `; if ($LASTEXITCODE -eq 0) { ${segments[i]} }`;
    }
    return command;
  }
  return segments.join(' && ');
}

export function prepareUserProgram(expanded: string, shell: ShellKind): string {
  const segments = splitOnAnd(expanded).map((segment) => ensurePowerShellCall(segment, shell));
  return joinWithAnd(segments, shell);
}

function ensurePowerShellCall(segment: string, shell: ShellKind): string {
  if (shell !== 'powershell' && shell !== 'pwsh') {
    return segment;
  }
  const trimmed = segment.trim();
  if (trimmed.startsWith('&')) {
    return trimmed;
  }
  if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
    return `& ${trimmed}`;
  }
  return trimmed;
}

export function firstExecutableToken(command: string): string {
  let text = command.trim();
  if (text.startsWith('&')) {
    text = text.slice(1).trim();
  }
  if (text.startsWith("'")) {
    return readQuoted(text, "'");
  }
  if (text.startsWith('"')) {
    return readQuoted(text, '"');
  }
  const match = /^[^\s]+/.exec(text);
  return match?.[0] ?? '';
}

function readQuoted(text: string, quote: "'" | '"'): string {
  let out = '';
  for (let i = 1; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (ch === quote) {
      if (text[i + 1] === quote) {
        out += quote;
        i++;
        continue;
      }
      return out;
    }
    out += ch;
  }
  return out;
}

function preflightFromCustom(program: string, exePath: string): string[] {
  const tokens: string[] = [];
  for (const segment of splitOnAnd(program)) {
    const trimmed = segment.trim();
    const withoutCall = trimmed.startsWith('&') ? trimmed.slice(1).trim() : trimmed;
    if (withoutCall.startsWith("'") || withoutCall.startsWith('"')) {
      continue;
    }
    const bare = firstExecutableToken(withoutCall);
    if (!bare || bare === exePath || bare.startsWith('-')) {
      continue;
    }
    tokens.push(bare);
  }
  return tokens;
}

function wrapWithCwd(shell: ShellKind, cwd: string, program: string, clear: boolean): string {
  const quotedCwd = quoteArg(cwd, shell);
  switch (shell) {
    case 'cmd': {
      const setup = clear ? 'chcp 65001 >nul & cls & ' : 'chcp 65001 >nul & ';
      return `${setup}cd /d ${quotedCwd} && ${program}`;
    }
    case 'powershell': {
      const setup = clear ? 'Clear-Host; ' : '';
      return `${setup}Set-Location -LiteralPath ${quotedCwd}; if ($?) { ${program} }`;
    }
    case 'pwsh': {
      const setup = clear ? 'Clear-Host; ' : '';
      return `${setup}Set-Location -LiteralPath ${quotedCwd} && ${program}`;
    }
    default: {
      const setup = clear ? 'clear; ' : '';
      return `${setup}cd ${quotedCwd} && ${program}`;
    }
  }
}
