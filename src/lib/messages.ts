export class RunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunError';
  }
}

export function newlinePathMessage(): string {
  return 'OkLiteRun cannot run a path that contains a newline.';
}

export function unsupportedMessage(languageId: string): string {
  return `OkLiteRun does not know how to run "${languageId}". Add a command under okliterun.executorMap, for example { "${languageId}": "my-tool $file" }.`;
}

export function typescriptMissingMessage(): string {
  return "OkLiteRun can't find tsx or ts-node on PATH. Install one of them (`npm install -g tsx` or `npm install -g ts-node`), or set okliterun.executorMap.typescript to a command you have.";
}

export function installHint(executable: string): string {
  const base = executable.split(/[/\\]/).pop()?.replace(/\.exe$/i, '').toLowerCase() ?? executable.toLowerCase();
  switch (base) {
    case 'python':
    case 'python3':
    case 'py':
      return 'Install Python from https://www.python.org/downloads/ and make sure it is on PATH, or select an interpreter with the Python extension (Python: Select Interpreter). You can also set okliterun.pythonPath.';
    case 'node':
      return 'Install Node.js from https://nodejs.org/ and make sure node is on PATH.';
    case 'tsx':
    case 'ts-node':
      return 'Install tsx (`npm install -g tsx`) or ts-node (`npm install -g ts-node`), or set okliterun.executorMap for TypeScript.';
    case 'gcc':
      return 'Install a C compiler and make sure gcc is on PATH. On Windows, install MinGW-w64 or MSYS2. On macOS, install the Xcode Command Line Tools (`xcode-select --install`). On Linux, install gcc with your package manager.';
    case 'g++':
      return 'Install a C++ compiler and make sure g++ is on PATH. On Windows, install MinGW-w64 or MSYS2. On macOS, install the Xcode Command Line Tools. On Linux, install g++ with your package manager.';
    case 'java':
      return 'Install a JDK 11 or newer from https://adoptium.net/ and make sure java is on PATH. OkLiteRun runs a single file with `java File.java`.';
    case 'go':
      return 'Install Go from https://go.dev/dl/ and make sure go is on PATH.';
    case 'php':
      return 'Install PHP from https://www.php.net/downloads and make sure php is on PATH.';
    case 'bash':
    case 'sh':
      return 'Install a Bash-compatible shell and make sure it is on PATH. On Windows, install Git for Windows (Git Bash) or use WSL.';
    case 'pwsh':
    case 'powershell':
      return 'Install PowerShell 7 (pwsh) from https://github.com/PowerShell/PowerShell or use Windows PowerShell. You can override the command in okliterun.executorMap.';
    default:
      return `Install "${base}" and make sure it is on PATH, or set the full command in okliterun.executorMap (or okliterun.pythonPath for Python).`;
  }
}

export function notFoundMessage(executable: string, languageName: string): string {
  const shown = executable.trim() || 'the configured executable';
  return `OkLiteRun can't find "${shown}" (${languageName}). ${installHint(shown)}`;
}
