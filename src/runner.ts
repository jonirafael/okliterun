import { execFile } from 'node:child_process';
import * as vscode from 'vscode';
import { readConfig, type OkLiteRunConfig } from './config';
import { buildCommand, type RunPlan } from './lib/command';
import { terminalEnvironment } from './lib/environment';
import { isBuiltinLanguage, languageDisplayName, lookupExecutor } from './lib/languages';
import { notFoundMessage, RunError } from './lib/messages';
import { basenameOf, dirnameOf, resolveWorkingDirectory, wslPathToWindows } from './lib/paths';
import { killProcessTree } from './lib/processTree';
import { firstExisting, resolvePythonExecutable } from './lib/resolveTools';
import { prefixRunMarker, resolveShellKind, type ShellKind } from './lib/shell';
import { spawnPlan, type ManagedProcess } from './lib/spawnRun';
import { cleanupStaleTempDirs, removeTemp, tempScriptName, writeTempSource } from './lib/tempFiles';
import { commandExists, wslWhichInvocation } from './lib/which';
import { getPythonEnvironment } from './python';

interface PreparedSource {
  filePath: string;
  sourceDir?: string;
  tempDir?: string;
  displayName: string;
}

export class Runner implements vscode.Disposable {
  private readonly channel: vscode.OutputChannel;
  private readonly subs: vscode.Disposable[] = [];
  private terminal: vscode.Terminal | undefined;
  private active: ManagedProcess | undefined;
  private tempDir: string | undefined;
  private activeToken: string | undefined;
  private running = false;
  private generation = 0;
  private readonly terminalsWeClosed = new Set<vscode.Terminal>();

  constructor() {
    this.channel = vscode.window.createOutputChannel('OkLiteRun');
    this.subs.push(this.channel);
    this.subs.push(vscode.window.onDidChangeActiveTextEditor(() => {
      void this.refreshCanRun();
    }));
    this.subs.push(vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('okliterun')) {
        void this.refreshCanRun();
      }
    }));
    this.subs.push(vscode.window.onDidCloseTerminal((terminal) => {
      if (this.terminalsWeClosed.has(terminal)) {
        this.terminalsWeClosed.delete(terminal);
        return;
      }
      if (terminal === this.terminal) {
        this.terminal = undefined;
        void this.finishNaturally(this.generation);
      }
    }));
    this.subs.push(vscode.window.onDidEndTerminalShellExecution((event) => {
      if (event.terminal !== this.terminal || !this.activeToken) {
        return;
      }
      const reported = event.execution.commandLine;
      const text = typeof reported === 'string' ? reported : reported.value;
      if (!text.includes(this.activeToken)) {
        return;
      }
      void this.finishNaturally(this.generation);
    }));
    void cleanupStaleTempDirs();
    void this.refreshCanRun();
  }

  async run(): Promise<void> {
    this.generation += 1;
    const generation = this.generation;
    try {
      await this.resetRunning();
      if (generation !== this.generation) {
        return;
      }
      await this.launch(generation);
    } catch (error) {
      if (generation === this.generation) {
        await this.setRunning(false);
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error('[OkLiteRun]', error);
      void vscode.window.showErrorMessage(message);
    }
  }

  async stop(): Promise<void> {
    if (!this.running && !this.active && !this.terminal) {
      void vscode.window.showInformationMessage('OkLiteRun is not running anything.');
      return;
    }
    this.generation += 1;
    await this.resetRunning();
  }

  dispose(): void {
    this.generation += 1;
    for (const sub of this.subs) {
      sub.dispose();
    }
    this.subs.length = 0;
    void this.resetRunning();
    this.channel.dispose();
  }

  private async launch(generation: number): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new RunError('Open a file to run.');
    }
    const document = editor.document;
    const config = readConfig(document.uri);
    const languageId = document.languageId;
    const template = lookupExecutor(config.executorMap, languageId);
    if (!template && !isBuiltinLanguage(languageId)) {
      throw new RunError(
        `OkLiteRun does not know how to run "${languageId}". Add a command under okliterun.executorMap, for example { "${languageId}": "my-tool $file" }.`,
      );
    }

    const source = await this.prepareSource(editor, config);
    if (generation !== this.generation) {
      await removeTemp(source.tempDir);
      return;
    }
    this.tempDir = source.tempDir;

    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    const directory = resolveWorkingDirectory({
      mode: config.cwd,
      sourceDir: source.sourceDir,
      workspaceRoot: folder?.uri.fsPath,
      fallbackDir: source.tempDir ?? source.sourceDir ?? dirnameOf(source.filePath),
    });
    if (directory.notice) {
      void vscode.window.showWarningMessage(directory.notice);
    }

    const shellChoice = readShellChoice();
    const shell = resolveShellKind({
      explicitShellPath: shellChoice.explicitShellPath,
      envShell: shellChoice.envShell,
      profileName: shellChoice.profileName,
      platform: process.platform,
    });

    const needsPython = languageId === 'python' || Boolean(template?.includes('$python'));
    const python = needsPython
      ? await this.resolvePython(document.uri, config)
      : { pythonPath: config.pythonPath, env: undefined };
    const typescriptRunner = await this.resolveTypescript(languageId, template);
    const shellScriptRunner = await this.resolveShellScript(languageId, template);
    const powershellRunner = await this.resolvePowerShell(languageId, template);

    const input: Parameters<typeof buildCommand>[0] = {
      languageId,
      filePath: source.filePath,
      cwd: directory.cwd,
      workspaceRoot: folder?.uri.fsPath,
      shell,
      platform: process.platform,
      pythonPath: python.pythonPath,
      typescriptRunner,
      shellScriptRunner,
      powershellRunner,
      executorMap: config.executorMap,
      clearPreviousOutput: config.clearPreviousOutput,
    };
    const plan = buildCommand(input);
    await this.ensureTools(plan, shell, languageId);
    if (generation !== this.generation) {
      return;
    }

    void vscode.window.setStatusBarMessage(`OkLiteRun: running ${source.displayName}`, 4000);
    await this.setRunning(true);
    console.log(`[OkLiteRun] ${languageId} shell=${shell} cwd=${directory.cwd}`);
    console.log(`[OkLiteRun] ${plan.terminalCommand}`);

    if (config.runInTerminal) {
      await this.runInTerminal(plan, shell, python.env, config.preserveFocus, generation);
      return;
    }
    await this.runInOutput(plan, shell, shellChoice.explicitShellPath, python.env, languageId, generation);
  }

  private async prepareSource(editor: vscode.TextEditor, config: OkLiteRunConfig): Promise<PreparedSource> {
    const document = editor.document;
    const selection = editor.selection;
    const selectedText = document.getText(selection);
    const useSelection = !selection.isEmpty && selectedText.trim().length > 0 && !coversWholeDocument(document, selection);

    if (config.saveBeforeRun && (document.isDirty || document.isUntitled)) {
      const saved = await document.save();
      if (!saved) {
        throw new RunError('OkLiteRun did not run because the file was not saved.');
      }
    }

    const realFile = document.uri.scheme === 'file' ? document.uri.fsPath : undefined;
    if (!useSelection && realFile && !document.isDirty) {
      return {
        filePath: realFile,
        sourceDir: dirnameOf(realFile),
        displayName: basenameOf(realFile),
      };
    }

    const text = useSelection ? selectedText : document.getText();
    const name = tempScriptName(document.languageId, realFile ? basenameOf(realFile) : undefined);
    const written = await writeTempSource(name, text);
    if (!useSelection && document.isDirty && !config.saveBeforeRun) {
      void vscode.window.setStatusBarMessage('OkLiteRun: running unsaved changes from a temporary file', 4000);
    }
    return {
      filePath: written.filePath,
      sourceDir: realFile ? dirnameOf(realFile) : undefined,
      tempDir: written.directory,
      displayName: name,
    };
  }

  private async resolvePython(
    resource: vscode.Uri,
    config: OkLiteRunConfig,
  ): Promise<{ pythonPath: string; env?: Record<string, string | undefined> }> {
    const fromExtension = await getPythonEnvironment(resource);
    const pythonPath = await resolvePythonExecutable({
      configured: config.pythonPath,
      fromExtension: fromExtension.executable,
      platform: process.platform,
      exists: commandExists,
    });
    return { pythonPath: pythonPath ?? '', env: fromExtension.env };
  }

  private async resolveTypescript(languageId: string, template: string | undefined): Promise<string | undefined> {
    if (template || (languageId !== 'typescript' && languageId !== 'typescriptreact')) {
      return undefined;
    }
    return firstExisting(['tsx', 'ts-node'], commandExists);
  }

  private async resolveShellScript(languageId: string, template: string | undefined): Promise<string> {
    if (template || languageId !== 'shellscript') {
      return 'bash';
    }
    return (await firstExisting(['bash', 'sh'], commandExists)) ?? 'bash';
  }

  private async resolvePowerShell(languageId: string, template: string | undefined): Promise<string> {
    const fallback = process.platform === 'win32' ? 'powershell' : 'pwsh';
    if (template || languageId !== 'powershell') {
      return fallback;
    }
    const candidates = process.platform === 'win32' ? ['pwsh', 'powershell'] : ['pwsh', 'powershell'];
    return (await firstExisting(candidates, commandExists)) ?? fallback;
  }

  private async ensureTools(plan: RunPlan, shell: ShellKind, languageId: string): Promise<void> {
    const languageName = languageDisplayName(languageId);
    for (const executable of plan.preflight) {
      if (!(await this.existsForRun(executable, shell))) {
        throw new RunError(notFoundMessage(executable, languageName));
      }
    }
  }

  private async existsForRun(executable: string, shell: ShellKind): Promise<boolean> {
    if (await commandExists(executable)) {
      return true;
    }
    if (shell !== 'wsl') {
      return false;
    }
    const windowsPath = wslPathToWindows(executable);
    if (windowsPath && (await commandExists(windowsPath))) {
      return true;
    }
    if (process.platform !== 'win32') {
      return false;
    }
    const query = wslWhichInvocation(executable);
    if (!query) {
      return false;
    }
    return execSucceeds(query.file, query.args);
  }

  private async runInTerminal(
    plan: RunPlan,
    shell: ShellKind,
    pythonEnv: Record<string, string | undefined> | undefined,
    preserveFocus: boolean,
    generation: number,
  ): Promise<void> {
    const token = randomToken();
    const command = prefixRunMarker(shell, plan.terminalCommand, token);
    const terminal = vscode.window.createTerminal({
      name: 'OkLiteRun',
      cwd: plan.cwd,
      env: terminalEnvironment({ platform: process.platform, shell, pythonEnv }),
      iconPath: new vscode.ThemeIcon('play'),
    });
    this.terminal = terminal;
    this.activeToken = `okliterun${token}`;
    terminal.show(preserveFocus);
    await waitForShellIntegration(terminal, 2000);
    if (generation !== this.generation || this.terminal !== terminal) {
      return;
    }
    terminal.sendText(command, true);
  }

  private async runInOutput(
    plan: RunPlan,
    shell: ShellKind,
    shellPath: string | undefined,
    pythonEnv: Record<string, string | undefined> | undefined,
    languageId: string,
    generation: number,
  ): Promise<void> {
    const config = readConfig();
    if (config.clearPreviousOutput) {
      this.channel.clear();
    }
    this.channel.show(config.preserveFocus);
    this.channel.appendLine(`[OkLiteRun] ${languageDisplayName(languageId)}`);
    if (plan.directSteps) {
      for (const step of plan.directSteps) {
        this.channel.appendLine(step.join(' '));
      }
    } else {
      this.channel.appendLine(plan.shellCommand ?? plan.terminalCommand);
    }
    this.channel.appendLine('');
    this.channel.appendLine('stdin is not connected in output channel mode. Set okliterun.runInTerminal to read input.');
    this.channel.appendLine('');

    const env = {
      ...process.env,
      ...terminalEnvironment({ platform: process.platform, shell, pythonEnv }),
    };
    const managed = spawnPlan({
      cwd: plan.cwd,
      env,
      directSteps: plan.directSteps,
      shellCommand: plan.shellCommand,
      shell: plan.shellCommand ? shell : undefined,
      shellPath,
      onStdout: (chunk) => this.channel.append(chunk),
      onStderr: (chunk) => this.channel.append(chunk),
    });
    this.active = managed;
    void managed.done.then(async (code) => {
      if (generation !== this.generation) {
        return;
      }
      if (code && code !== 0) {
        this.channel.appendLine(`\n[OkLiteRun] exit code ${code}`);
      }
      await this.finishNaturally(generation);
    }).catch(async (error: unknown) => {
      if (generation !== this.generation) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      const text = /ENOENT/.test(message)
        ? notFoundMessage(plan.preflight[0] ?? 'the configured executable', languageDisplayName(languageId))
        : `OkLiteRun failed to start the program. ${message}`;
      this.channel.appendLine(text);
      void vscode.window.showErrorMessage(text);
      await this.finishNaturally(generation);
    });
  }

  private async finishNaturally(generation: number): Promise<void> {
    if (generation !== this.generation) {
      return;
    }
    const tempDir = this.tempDir;
    this.tempDir = undefined;
    this.active = undefined;
    this.activeToken = undefined;
    await removeTemp(tempDir);
    await this.setRunning(false);
  }

  private async resetRunning(): Promise<void> {
    const active = this.active;
    const terminal = this.terminal;
    const tempDir = this.tempDir;
    this.active = undefined;
    this.terminal = undefined;
    this.tempDir = undefined;
    this.activeToken = undefined;
    if (active) {
      await active.cancel();
    }
    if (terminal) {
      try {
        if (terminal.exitStatus === undefined) {
          terminal.sendText('\u0003', false);
          const pid = await terminal.processId;
          if (pid && pid > 1) {
            await delay(350);
            await killProcessTree(pid, { includeRoot: false });
          }
        }
      } catch (error) {
        console.error('[OkLiteRun] stop failed', error);
      }
      this.terminalsWeClosed.add(terminal);
      terminal.dispose();
    }
    await removeTemp(tempDir);
    await this.setRunning(false);
  }

  private async refreshCanRun(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const languageId = editor?.document.languageId;
    const config = readConfig(editor?.document.uri);
    const canRun = Boolean(languageId && (isBuiltinLanguage(languageId) || lookupExecutor(config.executorMap, languageId)));
    await vscode.commands.executeCommand('setContext', 'okliterun.canRun', canRun);
  }

  private async setRunning(running: boolean): Promise<void> {
    this.running = running;
    await vscode.commands.executeCommand('setContext', 'okliterun.running', running);
  }
}

function coversWholeDocument(document: vscode.TextDocument, selection: vscode.Selection): boolean {
  if (selection.isEmpty || document.lineCount === 0) {
    return false;
  }
  const end = document.lineAt(document.lineCount - 1).range.end;
  return selection.start.line === 0 && selection.start.character === 0 && selection.end.isEqual(end);
}

function readShellChoice(): { explicitShellPath?: string; profileName?: string; envShell?: string } {
  const platformKey = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
  const config = vscode.workspace.getConfiguration('terminal.integrated');
  const profileName = config.get<string>(`defaultProfile.${platformKey}`);
  const profiles = config.get<Record<string, { path?: string | string[] }>>(`profiles.${platformKey}`);
  let explicitShellPath: string | undefined;
  if (profileName && profiles?.[profileName]) {
    const configured = profiles[profileName].path;
    if (typeof configured === 'string' && configured.trim()) {
      explicitShellPath = configured;
    } else if (Array.isArray(configured)) {
      explicitShellPath = configured.find((entry) => typeof entry === 'string' && entry.trim());
    }
  }
  return {
    explicitShellPath,
    profileName: profileName || undefined,
    envShell: vscode.env.shell || undefined,
  };
}

function waitForShellIntegration(terminal: vscode.Terminal, ms: number): Promise<void> {
  if (terminal.shellIntegration) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sub.dispose();
      resolve();
    }, ms);
    const sub = vscode.window.onDidChangeTerminalShellIntegration((event) => {
      if (event.terminal === terminal) {
        clearTimeout(timer);
        sub.dispose();
        resolve();
      }
    });
  });
}

function randomToken(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function execSucceeds(file: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 8000 }, (error, stdout) => {
      resolve(!error && Boolean(stdout && stdout.toString().trim()));
    });
  });
}
