// Platform-aware elevation for CEP panel file operations.
type CepNodeRequire = (id: string) => unknown;

const readCepNodeRequireFromWindow = (win: Window): CepNodeRequire | null => {
	const maybe = win as Window & {
		cep_node?: { require?: CepNodeRequire };
	};
	if (typeof maybe.cep_node?.require === "function") {
		return maybe.cep_node.require;
	}
	return null;
};

const readCepProcessFromWindow = (
	win: Window,
): {
	platform?: string;
	env?: Record<string, string | undefined>;
} | null => {
	const maybe = win as Window & {
		cep_node?: {
			process?: {
				platform?: string;
				env?: Record<string, string | undefined>;
			};
		};
	};
	return maybe.cep_node?.process ?? null;
};

const readBufferCtor = (
	requireFn: CepNodeRequire,
): {
	from(
		input: string,
		encoding: "utf16le",
	): { toString(encoding: "base64"): string };
} | null => {
	if (typeof Buffer !== "undefined") {
		return Buffer;
	}
	const fallback = requireFn("buffer") as {
		Buffer?: {
			from(
				input: string,
				encoding: string,
			): { toString(encoding: string): string };
		};
	};
	return fallback.Buffer ?? null;
};

/**
 * Result of an elevated write attempt. `ok` is true iff the inner script
 * ran to completion with exit code 0. `stderr` captures the inner script's
 * StandardError (written by the outer launcher to a temp log file and read
 * back from the outer, non-elevated shell — `Start-Process -Verb RunAs
 * -WindowStyle Hidden` detaches the pipe so we cannot capture it directly).
 * `elevatedConsentDenied` is true when the inner script never ran because
 * the UAC consent dialog was dismissed (inner exit code 1223,
 * ERROR_CANCELLED, from `Start-Process -Verb RunAs`).
 *
 * The four fields together let the onboarding finish handler distinguish:
 *   - UAC was denied              (`elevatedConsentDenied: true`)
 *   - admin token cannot write    (`ok: false`, non-1223 exit code, stderr
 *                                   contains "Access is denied" / ACL error)
 *   - path malformed / I/O error  (`ok: false`, stderr has the .NET/PS
 *                                   error message)
 *   - write succeeded             (`ok: true`)
 */
export type ElevationWriteResult = {
	readonly ok: boolean;
	/** Inner PowerShell / osascript exit code. -1 when the inner script never ran. */
	readonly exitCode: number;
	/** Inner script StandardError text (empty string when not captured). */
	readonly stderr: string;
	/** True iff the UAC consent dialog was dismissed (exit code 1223). */
	readonly elevatedConsentDenied: boolean;
};

const FAILED_RESULT: ElevationWriteResult = {
	ok: false,
	exitCode: -1,
	stderr: "",
	elevatedConsentDenied: false,
};

/**
 * Windows exit code that `Start-Process -Verb RunAs` reports when the
 * UAC consent dialog is dismissed (ERROR_CANCELLED). We surface it as a
 * separate field so the onboarding handler can tell "user said No to UAC"
 * apart from "admin token ran but could not write".
 */
const WINDOWS_ERROR_CANCELLED = 1223;

/**
 * Drop a leading UTF-8 byte-order mark before comparing bytes.
 *
 * `fs.readFileSync(path, "utf8")` does not strip a BOM, while some writers
 * emit one. The mark is encoding metadata, not content, so it must not turn
 * a write that landed into a reported mismatch — that would fail every
 * elevated write on Windows for a file that is actually correct.
 */
const stripLeadingBom = (value: string): string =>
	value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;

const parseExitCodeFromLauncherOutput = (output: string): number => {
	const match = output.match(/EXITCODE:(-?\d+)/);
	if (!match) {
		return -1;
	}
	const parsed = Number.parseInt(match[1], 10);
	return Number.isFinite(parsed) ? parsed : -1;
};

const readTempLog = (requireFn: CepNodeRequire, logPath: string): string => {
	try {
		const fsMod = requireFn("fs") as {
			readFileSync(path: string, encoding: "utf8"): string;
			existsSync(path: string): boolean;
		};
		if (!fsMod.existsSync(logPath)) {
			return "";
		}
		return fsMod.readFileSync(logPath, "utf8") ?? "";
	} catch {
		return "";
	}
};

const buildTempLogPath = (
	proc: { env?: Record<string, string | undefined> } | null,
	requireFn: CepNodeRequire,
): string => {
	const tempRoot = proc?.env?.TEMP;
	if (tempRoot) {
		return `${tempRoot}\\ty-plus-elev-${process.pid ?? Date.now()}.log`;
	}
	const osMod = requireFn("os") as { tmpdir(): string };
	const pathMod = requireFn("path") as { join(...parts: string[]): string };
	const pid =
		(globalThis as { process?: { pid?: number } }).process?.pid ?? Date.now();
	return pathMod.join(osMod.tmpdir(), `ty-plus-elev-${pid}.log`);
};

const runElevatedPowerShellSync = (
	requireFn: CepNodeRequire,
	proc: { env?: Record<string, string | undefined> } | null,
	psScript: string,
	options: {
		waitForExit?: boolean;
	} = {},
): ElevationWriteResult => {
	const bufferCtor = readBufferCtor(requireFn);
	if (!bufferCtor) {
		return FAILED_RESULT;
	}
	const childProcess = requireFn("child_process") as {
		execFileSync(
			command: string,
			args: string[],
			options: { stdio: "pipe"; windowsHide: boolean },
		): Buffer;
	};

	const encodedScript = bufferCtor.from(psScript, "utf16le").toString("base64");
	const waitForExit = options.waitForExit !== false;

	// Issue #48: the inner script's exit code is captured by launching it
	// with `-PassThru` and waiting for it via `Wait-Process` (Start-Process
	// with `-Wait` swallows the ExitCode). The inner script's stderr is
	// redirected to a temp log file (Windows detaches the pipe under
	// `-WindowStyle Hidden`, so piping it directly back to the outer shell
	// is unreliable) which the outer launcher reads back after
	// `Wait-Process` returns.
	const tempLogPath = buildTempLogPath(proc, requireFn);
	const escapedLogPath = tempLogPath.replace(/'/g, "''");

	const launcherScript = [
		`$tempLog = '${escapedLogPath}'`,
		`$proc = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -PassThru -RedirectStandardError $tempLog ${waitForExit ? "-Wait " : ""}-ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encodedScript}')`,
		waitForExit
			? `Wait-Process -InputObject $proc; Write-Output "EXITCODE:$($proc.ExitCode)"`
			: `Write-Output "EXITCODE:$($proc.ExitCode)"`,
	].join("; ");

	const systemRoot = proc?.env?.SystemRoot || "C:\\Windows";
	const powershellPath = `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;

	let launcherOutput: Buffer;
	try {
		launcherOutput = childProcess.execFileSync(
			powershellPath,
			["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", launcherScript],
			{
				stdio: "pipe",
				windowsHide: true,
			},
		);
	} catch {
		return {
			ok: false,
			exitCode: -1,
			stderr: readTempLog(requireFn, tempLogPath),
			elevatedConsentDenied: true,
		};
	}

	const exitCode = parseExitCodeFromLauncherOutput(
		launcherOutput?.toString() ?? "",
	);
	const stderr = readTempLog(requireFn, tempLogPath);
	return {
		ok: exitCode === 0,
		exitCode,
		stderr,
		elevatedConsentDenied: exitCode === WINDOWS_ERROR_CANCELLED,
	};
};

const runElevatedOsascriptSync = (
	requireFn: CepNodeRequire,
	shellCommand: string,
): ElevationWriteResult => {
	try {
		const childProcess = requireFn("child_process") as {
			execFileSync(
				command: string,
				args: string[],
				options: { stdio: "pipe" },
			): { toString(): string };
		};
		// Escape single quotes for AppleScript shell command
		const escapedCommand = shellCommand.replace(/'/g, "'\\''");
		const script = `do shell script "${escapedCommand}" with administrator privileges`;
		// Escape the whole AppleScript string for osascript -e
		const escapedScript = script.replace(/'/g, "'\"'\"'");
		childProcess.execFileSync("osascript", ["-e", escapedScript], {
			stdio: "pipe",
		});
		return { ok: true, exitCode: 0, stderr: "", elevatedConsentDenied: false };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		// osascript surfaces the underlying shell stderr inside the thrown
		// error's message — propagate it so callers can distinguish
		// "user denied admin" from "shell could not write".
		const denied =
			message.toLowerCase().includes("user canceled") ||
			message.toLowerCase().includes("not authorized");
		return {
			ok: false,
			exitCode: denied ? WINDOWS_ERROR_CANCELLED : 1,
			stderr: message,
			elevatedConsentDenied: denied,
		};
	}
};

const createMacFolderWithElevation = (
	win: Window,
	folderPath: string,
): ElevationWriteResult => {
	const requireFn = readCepNodeRequireFromWindow(win);
	const proc = readCepProcessFromWindow(win);
	if (!requireFn || proc?.platform !== "darwin") {
		return FAILED_RESULT;
	}

	const normalizedFolderPath = folderPath.trim();
	if (!normalizedFolderPath) {
		return FAILED_RESULT;
	}

	try {
		const fsMod = requireFn("fs") as {
			existsSync(path: string): boolean;
		};
		// Escape single quotes for shell
		const escapedPath = normalizedFolderPath.replace(/'/g, "'\\''");
		const result = runElevatedOsascriptSync(
			requireFn,
			`mkdir -p '${escapedPath}'`,
		);
		if (!result.ok) {
			return result;
		}
		return fsMod.existsSync(normalizedFolderPath)
			? result
			: {
					ok: false,
					exitCode: result.exitCode,
					stderr: "elevated mkdir reported success but the folder is missing",
					elevatedConsentDenied: false,
				};
	} catch {
		return FAILED_RESULT;
	}
};

const writeFileWithElevatedOsascript = (
	win: Window,
	filePath: string,
	content: string,
): ElevationWriteResult => {
	const requireFn = readCepNodeRequireFromWindow(win);
	const proc = readCepProcessFromWindow(win);
	if (!requireFn || proc?.platform !== "darwin") {
		return FAILED_RESULT;
	}

	const normalizedFilePath = filePath.trim();
	if (!normalizedFilePath) {
		return FAILED_RESULT;
	}

	try {
		const fsMod = requireFn("fs") as {
			existsSync(path: string): boolean;
			readFileSync?: (path: string, encoding: "utf8") => string;
		};

		// Write content to temp file, then move with admin privileges
		const escapedDest = normalizedFilePath.replace(/'/g, "'\\''");
		const parentDir = normalizedFilePath
			.replace(/\\/g, "/")
			.split("/")
			.slice(0, -1)
			.join("/")
			.replace(/'/g, "'\\''");

		const escapedContent = content.replace(/'/g, "'\\''");
		const result = runElevatedOsascriptSync(
			requireFn,
			`mkdir -p '${parentDir}' && printf '%s' '${escapedContent}' > '${escapedDest}'`,
		);
		if (!result.ok) {
			return result;
		}
		if (!fsMod.existsSync(normalizedFilePath)) {
			return {
				ok: false,
				exitCode: result.exitCode,
				stderr: "elevated osascript reported success but file is missing",
				elevatedConsentDenied: false,
			};
		}
		if (typeof fsMod.readFileSync === "function") {
			const ok =
				stripLeadingBom(fsMod.readFileSync(normalizedFilePath, "utf8")) ===
				content;
			return {
				ok,
				exitCode: ok ? 0 : 1,
				stderr: ok ? "" : "elevated write produced content mismatch",
				elevatedConsentDenied: false,
			};
		}
		return { ok: true, exitCode: 0, stderr: "", elevatedConsentDenied: false };
	} catch {
		return FAILED_RESULT;
	}
};

/**
 * Whether the elevation adapter can actually run on this host window.
 *
 * Both platforms go through `child_process.execFileSync`, which only
 * exists behind CEP's `cep_node.require`. Callers use this to report a
 * typed "elevation unavailable" failure instead of pretending a UAC
 * prompt was dismissed.
 *
 * NOTE: `setting/onboarding/trusted-root-policy.canAttemptElevation`
 * answers the same question for the onboarding finish phase with its own
 * platform mapping. It stays there because it is part of the onboarding
 * error surface; this helper is the write-side counterpart so
 * `storage/write` does not depend on the settings domain.
 */
export const isElevationAvailable = (win: Window): boolean => {
	const requireFn = readCepNodeRequireFromWindow(win);
	if (!requireFn) {
		return false;
	}
	const proc = readCepProcessFromWindow(win);
	if (proc?.platform !== "win32" && proc?.platform !== "darwin") {
		return false;
	}
	try {
		const childProcess = requireFn("child_process") as {
			execFileSync?: unknown;
		};
		return typeof childProcess.execFileSync === "function";
	} catch {
		return false;
	}
};

/**
 * Detects the current platform from the CEP node process.
 * Returns "windows" for win32, "mac" for darwin, or "unknown".
 */
const detectPlatform = (win: Window): "windows" | "mac" | "unknown" => {
	const proc = readCepProcessFromWindow(win);
	if (!proc) {
		return "unknown";
	}
	if (proc.platform === "win32") {
		return "windows";
	}
	if (proc.platform === "darwin") {
		return "mac";
	}
	return "unknown";
};

/**
 * Platform-agnostic folder creation with elevation, as a typed result.
 *
 * `ok` means the folder is on disk once the elevated run finished — the
 * existence probe is the contract, not the inner script's exit code
 * (the ACL half of the Windows script can fail after `New-Item` already
 * created the folder). `elevatedConsentDenied` distinguishes a dismissed
 * prompt from a run that completed but left no folder.
 *
 * Issue #160 needs the typed form so the `.ffx` authoring flow can report
 * "UAC was declined" instead of a generic failure.
 */
export const createFolderWithElevation = (
	win: Window,
	folderPath: string,
): ElevationWriteResult => {
	const platform = detectPlatform(win);
	if (platform === "mac") {
		return createMacFolderWithElevation(win, folderPath);
	}
	if (platform === "windows") {
		return createWindowsFolderWithElevation(win, folderPath);
	}
	return FAILED_RESULT;
};

/**
 * Platform-agnostic folder creation with elevation if needed.
 * Returns true if folder was created or already exists.
 */
export const requestFolderWriteElevation = (
	win: Window,
	folderPath: string,
): boolean => createFolderWithElevation(win, folderPath).ok;

/**
 * Platform-agnostic file removal with elevation if needed.
 * Returns true if the path was removed.
 */
export const removePathWithElevation = (
	win: Window,
	targetPath: string,
): boolean => {
	const normalized = targetPath.trim();
	if (!normalized) {
		return false;
	}
	const platform = detectPlatform(win);
	const requireFn = readCepNodeRequireFromWindow(win);
	const proc = readCepProcessFromWindow(win);
	if (!requireFn) {
		return false;
	}
	const fsMod = requireFn("fs") as { existsSync?: (path: string) => boolean };
	const escaped = normalized.replace(/'/g, "''");
	try {
		if (platform === "windows") {
			const psScript = `
$target = '${escaped}'
if (Test-Path -LiteralPath $target) {
  Remove-Item -LiteralPath $target -Recurse -Force
}
`;
			const result = runElevatedPowerShellSync(requireFn, proc, psScript);
			return result.ok && !fsMod.existsSync?.(normalized);
		}
		if (platform === "mac") {
			const shellPath = normalized.replace(/'/g, "'\\''");
			return runElevatedOsascriptSync(requireFn, `rm -rf '${shellPath}'`).ok;
		}
	} catch {
		return false;
	}
	return false;
};

export const writeFileWithElevation = (
	win: Window,
	filePath: string,
	content: string,
): ElevationWriteResult => {
	const platform = detectPlatform(win);
	if (platform === "mac") {
		return writeFileWithElevatedOsascript(win, filePath, content);
	}
	if (platform === "windows") {
		return writeFileWithElevatedPowerShell(win, filePath, content);
	}
	return FAILED_RESULT;
};

const createWindowsFolderWithElevation = (
	win: Window,
	folderPath: string,
): ElevationWriteResult => {
	const requireFn = readCepNodeRequireFromWindow(win);
	const proc = readCepProcessFromWindow(win);
	if (!requireFn || proc?.platform !== "win32") {
		return FAILED_RESULT;
	}

	const normalizedFolderPath = folderPath.trim();
	if (!normalizedFolderPath) {
		return FAILED_RESULT;
	}

	try {
		const fsMod = requireFn("fs") as {
			existsSync(path: string): boolean;
		};
		const psScript = `
$folderPath = '${normalizedFolderPath.replace(/'/g, "''")}'
if (-not (Test-Path $folderPath)) {
  New-Item -ItemType Directory -Path $folderPath -Force | Out-Null
}
$acl = Get-Acl $folderPath
$accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
  $env:USERNAME,
  'FullControl',
  'ContainerInherit,ObjectInherit',
  'None',
  'Allow'
)
$acl.SetAccessRule($accessRule)
Set-Acl $folderPath $acl
`;
		// The launcher must wait for the elevated child. Without `-Wait`,
		// reading `$proc.ExitCode` on a still-running process throws, which
		// the launcher reports as a spurious consent denial, and the caller
		// would probe `existsSync` before `New-Item` had run (Issue #160).
		const result = runElevatedPowerShellSync(requireFn, proc, psScript, {
			waitForExit: true,
		});
		if (result.elevatedConsentDenied) {
			return result;
		}
		let exists = false;
		try {
			exists = fsMod.existsSync(normalizedFolderPath);
		} catch {
			exists = false;
		}
		return exists ? { ...result, ok: true } : { ...result, ok: false };
	} catch {
		return FAILED_RESULT;
	}
};

const writeFileWithElevatedPowerShell = (
	win: Window,
	filePath: string,
	content: string,
): ElevationWriteResult => {
	const requireFn = readCepNodeRequireFromWindow(win);
	const proc = readCepProcessFromWindow(win);
	if (!requireFn || proc?.platform !== "win32") {
		return FAILED_RESULT;
	}

	const normalizedFilePath = filePath.trim();
	if (!normalizedFilePath) {
		return FAILED_RESULT;
	}

	try {
		const fsMod = requireFn("fs") as {
			existsSync(path: string): boolean;
			readFileSync?: (path: string, encoding: "utf8") => string;
		};

		// Note (Issue #40): `Start-Process powershell.exe -Verb RunAs` spawns
		// the script in a NEW logon session, so USERPROFILE / USERNAME /
		// HOMEDRIVE / etc. are NOT inherited from the CEP panel session.
		// This script does NOT reference any of those variables — it only
		// uses the path/content we pass in literally, `Split-Path`, `Test-Path`,
		// `New-Item`, and `[System.IO.File]::WriteAllText`. The env-var
		// inheritance concern is therefore moot for THIS path. The legacy
		// `requestWindowsFolderWriteElevation` script above DID use
		// `$env:USERNAME`, but Issue #44 removed the call site so that
		// code path is no longer exercised.
		// `[System.Text.Encoding]::UTF8` carries a preamble, and
		// `File.WriteAllText` writes it, so the file would start with a
		// UTF-8 BOM the caller's `readFileSync(path, "utf8")` does not
		// strip — the adapter's own read-back (and the CEP authoring
		// writer's) would then report a content mismatch on a write that
		// actually landed. `UTF8Encoding($false)` writes the exact bytes
		// that were asked for (Issue #160).
		const psScript = `
$filePath = '${normalizedFilePath.replace(/'/g, "''")}'
$parentDir = Split-Path -Parent $filePath
if (-not (Test-Path $parentDir)) {
  New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
}
[System.IO.File]::WriteAllText($filePath, '${content.replace(/'/g, "''")}', (New-Object System.Text.UTF8Encoding -ArgumentList $false))
`;
		const result = runElevatedPowerShellSync(requireFn, proc, psScript);
		if (!result.ok) {
			return result;
		}
		if (!fsMod.existsSync(normalizedFilePath)) {
			return {
				ok: false,
				exitCode: result.exitCode,
				stderr: result.stderr
					? `${result.stderr}\nelevated PowerShell reported success but file is missing`
					: "elevated PowerShell reported success but file is missing",
				elevatedConsentDenied: result.elevatedConsentDenied,
			};
		}
		if (typeof fsMod.readFileSync === "function") {
			const matches =
				stripLeadingBom(fsMod.readFileSync(normalizedFilePath, "utf8")) ===
				content;
			return {
				ok: matches,
				exitCode: matches ? 0 : 1,
				stderr: matches
					? ""
					: `${result.stderr ? `${result.stderr}\n` : ""}elevated write produced content mismatch`,
				elevatedConsentDenied: false,
			};
		}
		return result;
	} catch {
		return FAILED_RESULT;
	}
};
