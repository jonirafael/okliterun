import * as vscode from 'vscode';
import { normalizeBoolean, normalizeCwdMode, normalizeExecutorMap, type CwdMode } from './lib/settings';

export interface OkLiteRunConfig {
  runInTerminal: boolean;
  cwd: CwdMode;
  saveBeforeRun: boolean;
  clearPreviousOutput: boolean;
  preserveFocus: boolean;
  pythonPath: string;
  executorMap: Record<string, string>;
}

export function readConfig(resource?: vscode.Uri): OkLiteRunConfig {
  const cfg = vscode.workspace.getConfiguration('okliterun', resource);
  return {
    runInTerminal: normalizeBoolean(cfg.get('runInTerminal'), true),
    cwd: normalizeCwdMode(cfg.get('cwd')),
    saveBeforeRun: normalizeBoolean(cfg.get('saveBeforeRun'), true),
    clearPreviousOutput: normalizeBoolean(cfg.get('clearPreviousOutput'), true),
    preserveFocus: normalizeBoolean(cfg.get('preserveFocus'), false),
    pythonPath: (cfg.get<string>('pythonPath') ?? '').trim(),
    executorMap: normalizeExecutorMap(cfg.get('executorMap')),
  };
}
