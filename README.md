# OkLiteRun

A lightweight one-click code runner for VS Code (preview). Run the file you are editing, or just the current selection, without setting up a launch configuration.

**Demo GIF:** a short screen recording will be added at `docs/demo.gif` before a stable release. This preview does not ship a demo animation.

## Inspired by Code Runner

OkLiteRun is inspired by [Code Runner](https://github.com/formulahendry/vscode-code-runner) by Jun Han (formulahendry), MIT License. Code Runner's last release was in April 2024 and the project has hundreds of open issues. This extension is a clean-room rewrite in TypeScript. It does not copy Code Runner's source.

The preview concentrates on the problems that show up most often there:

- paths with spaces, quotes, parentheses, and other special characters, especially on Windows
- the wrong working directory (workspace root instead of the file's folder)
- ignoring the Python extension's selected interpreter and virtual environment
- `input()` / stdin doing nothing because the program ran in an output panel
- Windows PowerShell 5.1 rejecting `&&`
- running whatever was last saved, or failing to run a selection
- a cryptic "not recognized" error when the compiler or interpreter is missing

## Features

- **OkLiteRun: Run Code** from the editor title play button, the editor context menu, or the command palette.
- Default shortcut: `Ctrl+Alt+R` on Windows and Linux, `Cmd+Alt+R` on macOS, only while the editor has focus. VS Code already uses `Ctrl+Alt+R` for **Terminal: Run Recent Command** while the terminal is focused (on macOS that default is `Ctrl+Alt+R`, not `Cmd+Alt+R`). The editor shortcut does not take that binding.
- **OkLiteRun: Stop** sends Ctrl+C in the OkLiteRun terminal and then ends child processes that are still alive. In output-channel mode it kills the process tree it started.
- Languages: Python, JavaScript, TypeScript, C, C++, Java, Go, PHP, Bash/sh, and PowerShell.
- Runs in the integrated terminal by default, so interactive input works. A setting switches to an output channel.
- Quotes paths for bash, zsh, PowerShell 7 (`pwsh`), Windows PowerShell 5.1, Command Prompt, and WSL.
- Working directory defaults to the file's folder. Switch it to the workspace root.
- Uses the Python extension's selected interpreter when `ms-python.python` is installed, then `python3`, `python`, and on Windows `py`.
- Saves the file before running (configurable). A partial selection is written to a temp file that keeps the right extension and, for Java, the original file name.
- If `tsx` and `ts-node` are both missing, TypeScript runs stop with an install hint instead of a shell error.
- Override any language with `okliterun.executorMap`.

## Supported languages

| Language | Language id | Default command |
| --- | --- | --- |
| Python | `python` | `$python -u $file` |
| JavaScript | `javascript` | `node $file` |
| TypeScript | `typescript`, `typescriptreact` | `tsx $file`, or `ts-node $file` if `tsx` is not on PATH |
| C | `c` | `gcc $file -o $exe`, then run `$exe` |
| C++ | `cpp` | `g++ $file -o $exe`, then run `$exe` |
| Java | `java` | `java $file` (single-file source mode, JDK 11+) |
| Go | `go` | `go run $file` |
| PHP | `php` | `php $file` |
| Shell | `shellscript` | `bash $file`, or `sh $file` if bash is missing |
| PowerShell | `powershell` | `pwsh -NoProfile -ExecutionPolicy Bypass -File $file` |

`$exe` is the compiled program next to the source. On Windows it ends in `.exe`, except when the integrated terminal is WSL. `$python` is the resolved interpreter.

PowerShell scripts are started with `-ExecutionPolicy Bypass` for that process only. The machine policy is not changed. `-NoProfile` skips the user profile so a prompt in the profile cannot hang the run.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `okliterun.runInTerminal` | `true` | Run in the integrated terminal. Set to `false` to capture stdout/stderr in the **OkLiteRun** output channel. Output-channel mode does not connect stdin. |
| `okliterun.cwd` | `fileDir` | `fileDir` uses the file's directory. `workspaceRoot` uses the workspace folder that contains the file. |
| `okliterun.saveBeforeRun` | `true` | Save dirty and untitled editors before running. Canceling the save stops the run. |
| `okliterun.clearPreviousOutput` | `true` | Clear the terminal (`clear`, `Clear-Host`, or `cls`) or the output channel before each run. |
| `okliterun.preserveFocus` | `false` | Keep the cursor in the editor. Leave this off when the program reads input. |
| `okliterun.pythonPath` | `""` | Python executable. Empty uses the Python extension, then PATH. |
| `okliterun.executorMap` | `{}` | Per-language command overrides. See below. |

Example:

```json
{
  "okliterun.cwd": "fileDir",
  "okliterun.executorMap": {
    "python": "$python -u $file",
    "c": "gcc -Wall $file -o $exe && $exe"
  }
}
```

### Placeholders

Placeholders are replaced with values already quoted for the shell that will run the command. Do not wrap them in your own quotes.

| Placeholder | Value |
| --- | --- |
| `$file` | Absolute path of the file (or the temp file for a selection) |
| `$fileNoExt` | That path without the extension |
| `$dir` | Directory of that file |
| `$fileName` | Base name, including the extension |
| `$fileNameNoExt` | Base name without the extension |
| `$workspaceRoot` | Workspace folder that contains the file |
| `$exe` | Compiled output path (`*.exe` on Windows, except WSL) |
| `$python` | Resolved Python executable |

Write ` && ` (with spaces) between commands that should run only if the previous one succeeded. OkLiteRun rewrites that sequence for Windows PowerShell 5.1, which has no `&&` operator. Each piece is one shell command, so do not build a path by gluing placeholders together (`$dir/$fileName`). Use `$file`.

Language ids are the ones VS Code uses (`cpp`, not `c++`). `c++`, `js`, `ts`, `sh`, `shell`, and `ps1` are also accepted as map keys. A `typescript` entry applies to `.tsx` files when `typescriptreact` is not set.

## How quoting works

OkLiteRun reads the integrated terminal's default profile. An explicit profile path wins (`bash.exe` is bash, `pwsh.exe` is PowerShell 7, `powershell.exe` is Windows PowerShell, `cmd.exe` is Command Prompt, `wsl.exe` is WSL). Built-in profile names such as "Git Bash" and "Command Prompt" are used when the path is not written into settings. The profile name "PowerShell" uses Windows PowerShell syntax, which also runs under PowerShell 7. `&&` is emitted only when the shell executable is `pwsh`.

| Shell | Quoting |
| --- | --- |
| bash, zsh, WSL | Single quotes. An apostrophe becomes `'\''`. |
| pwsh, Windows PowerShell | Single quotes. An apostrophe is doubled. Commands are invoked with `&`. |
| Command Prompt | Double quotes. `%` and `!` are caret-escaped outside the quotes. The code page is set to UTF-8 (`chcp 65001`). A trailing backslash cannot eat the closing quote (`C:\` is passed as `C:\.`). |

Git Bash on Windows also gets `MSYS_NO_PATHCONV=1` so MSYS does not rewrite arguments. WSL terminals convert `C:\...` paths to `/mnt/c/...`.

Python runs set `PYTHONUNBUFFERED=1` and `PYTHONIOENCODING=utf-8` unless the selected environment already sets the encoding. When the Python extension reports environment variables for the active interpreter, those are applied too.

## Install from a VSIX

Do not publish this preview to a marketplace from a local checkout unless you mean to. To try a build:

1. Clone the repository and install dependencies with `npm install`.
2. Package it:

   ```bash
   npx @vscode/vsce package
   ```

   That produces `okliterun-0.1.0.vsix`. The `vscode:prepublish` script bundles the extension with esbuild first.
3. In VS Code, open the Extensions view, open the `...` menu, choose **Install from VSIX...**, and pick the `.vsix` file. Or from a terminal:

   ```bash
   code --install-extension okliterun-0.1.0.vsix
   ```

4. Reload the window if VS Code asks you to.
5. Open a supported file and use the play button in the editor title, or run **OkLiteRun: Run Code**.

### Windows

The same VSIX installs on Windows. After **Install from VSIX...**:

1. Open a `.py` file that lives in a folder whose name contains a space.
2. Press `Ctrl+Alt+R`, or click the play icon in the editor title bar.
3. The integrated terminal should show a quoted path and the program's output. Type into the terminal if the program reads input.
4. If Python does not start, install it from [python.org](https://www.python.org/downloads/) or pick an interpreter with **Python: Select Interpreter**. You can also set `okliterun.pythonPath` to the full path of `python.exe`.
5. C and C++ need `gcc` and `g++` on PATH (for example from [MSYS2](https://www.msys2.org/) or MinGW-w64). Java needs a JDK 11 or newer. TypeScript needs `tsx` or `ts-node`.
6. If your default terminal is Command Prompt, PowerShell, or Git Bash, OkLiteRun quotes for that shell. **OkLiteRun: Stop** stops the run.

To debug the extension itself on Windows, open this folder in VS Code and press F5 (**Run OkLiteRun**). That launches an Extension Development Host with a freshly built bundle.

## Development

Requirements: Node.js 18 or newer.

```bash
npm install
npm test
npm run lint
npm run typecheck
npm run build
```

Press F5 to launch the extension host. `npm run test:integration` runs the VS Code smoke tests (it downloads VS Code and needs a display; on Linux use `xvfb-run -a npm run test:integration`).

A GitHub Actions workflow lives at [`docs/ci-workflow.yml`](docs/ci-workflow.yml). Copy it to `.github/workflows/ci.yml` when the publishing token is allowed to update workflows.

## Known limitations

- One file at a time. There is no project build, no `make`/`cargo`, and no multi-file Java classpath. Java uses `java File.java`. A public class still has to match the file name. Untitled Java files are written as `Main.java`.
- A selection is copied to a temp file. Relative data files still resolve from the original file's directory, but the temp file is not a package module. The temp file is removed when the run ends. If the shell never reports that the command finished, it is removed on the next run or after a day.
- C and C++ use `gcc` and `g++` only. The executable is written next to the source (or in the temp directory for a selection). There is no MSVC, and no extra link flags.
- TypeScript is a single file via `tsx` or `ts-node`. `tsconfig` path aliases are not special-cased.
- Output-channel mode closes stdin. Programs that read input should use the terminal.
- Stop in the terminal sends Ctrl+C and then kills processes still parented by that shell. A process that detached from the shell can survive. Closing the terminal also ends the run.
- Shell detection follows the default terminal profile. A profile named "PowerShell" without an executable path is quoted with Windows PowerShell 5.1 syntax. Point the profile at `pwsh.exe` to get `&&`.
- WSL path conversion is best-effort (`C:\` to `/mnt/c/`). UNC paths are not rewritten. A Windows `python.exe` path is not a Linux interpreter; inside WSL, put a Linux `python3` on PATH or set `okliterun.executorMap`.
- Output-channel mode runs on the extension host. It does not enter a WSL distro. Use the terminal for that.
- Command Prompt is switched to UTF-8 for the OkLiteRun terminal. Other terminals already follow VS Code's encoding.
- PowerShell script runs do not load your profile (`-NoProfile`).
- The play button is shown for the built-in languages, and for any other language id you add to `okliterun.executorMap` after the extension has activated.

## License

MIT, copyright jonirafael. See [LICENSE](LICENSE).
