import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGE_IDS } from '../src/lib/languages';
import packageJson from '../package.json';

describe('extension manifest', () => {
  it('matches the preview identity', () => {
    expect(packageJson.name).toBe('okliterun');
    expect(packageJson.displayName).toBe('OkLiteRun');
    expect(packageJson.publisher).toBe('jonirafael');
    expect(packageJson.version).toBe('0.1.0');
    expect(packageJson.license).toBe('MIT');
    expect(packageJson.preview).toBe(true);
    expect(packageJson.description).toBe('A lightweight one-click code runner for VS Code (preview). Inspired by Code Runner.');
    expect(packageJson.repository.url).toContain('https://github.com/jonirafael/okliterun');
  });

  it('binds run to ctrl+alt+r only while the editor is focused', () => {
    const binding = packageJson.contributes.keybindings[0];
    expect(binding?.key).toBe('ctrl+alt+r');
    expect(binding?.mac).toBe('cmd+alt+r');
    expect(binding?.when).toContain('editorTextFocus');
    expect(binding?.when).toContain('!terminalFocus');
    expect(packageJson.contributes.commands.map((command) => command.title)).toEqual(['Run Code', 'Stop']);
  });

  it('offers the play button for every built-in language', () => {
    const when = packageJson.contributes.menus['editor/title'][0]?.when ?? '';
    for (const languageId of SUPPORTED_LANGUAGE_IDS) {
      expect(when).toContain(languageId);
    }
  });

  it('credits Code Runner and does not call this project a replacement', () => {
    const readme = fs.readFileSync('README.md', 'utf8');
    const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
    const license = fs.readFileSync('LICENSE', 'utf8');
    expect(readme).toMatch(/Inspired by Code Runner/);
    expect(readme).toContain('https://github.com/formulahendry/vscode-code-runner');
    expect(readme.toLowerCase()).not.toContain('replacement');
    expect(changelog.toLowerCase()).not.toContain('replacement');
    expect(JSON.stringify(packageJson).toLowerCase()).not.toContain('replacement');
    expect(license).toContain('Copyright (c) 2026 jonirafael');
    expect(fs.existsSync('docs/ci-workflow.yml')).toBe(true);
    expect(fs.existsSync('.github/workflows')).toBe(false);
  });

  it('ships a 128x128 png icon', () => {
    const icon = fs.readFileSync('media/icon.png');
    expect(icon.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(icon.readUInt32BE(16)).toBe(128);
    expect(icon.readUInt32BE(20)).toBe(128);
  });
});
