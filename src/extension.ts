import * as vscode from 'vscode';
import { Runner } from './runner';

let runner: Runner | undefined;

export function activate(context: vscode.ExtensionContext): void {
  runner = new Runner();
  context.subscriptions.push(runner);
  context.subscriptions.push(
    vscode.commands.registerCommand('okliterun.run', () => runner?.run()),
    vscode.commands.registerCommand('okliterun.stop', () => runner?.stop()),
  );
}

export function deactivate(): void {
  runner?.dispose();
  runner = undefined;
}
