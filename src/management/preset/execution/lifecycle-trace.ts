/**
 * Preset lifecycle trace — Issue #130
 *
 * End-to-end correlation-id log for preset save and execute flows.
 *
 * Every entry point that authors a preset (`tool-shell:*` dialogs, the
 * catalog-add `PathDialog`, the workspace tile → execute pipeline) emits
 * events through `tracePresetLifecycle`. The Debug Console and the
 * `preset-execution` LogBus source pick them up under a single
 * `presetId`, so a user reporting "Script file not found" can paste the
 * full chain from one panel reload.
 *
 * Diagnostic payload rules:
 *
 * - Paths and `presetId` only. No raw source code, no secrets, no AE
 *   credentials.
 * - `canonicalPath` is the host's `file.fsName` form when present
 *   (`filePath` may be the React-side preview string). The trace keeps
 *   both side-by-side so divergence is visible.
 * - The `entryPoint` discriminator tells which surface initiated the
 *   lifecycle (tool-shell dialog type, browser surface, etc.). Each call
 *   site picks exactly one.
 *
 * `traceExecute` is a small async helper for `execute.*` flows. It owns
 * the requested / completed / failed triplet so every dispatcher — tile,
 * Directory Browser, Catalog Browser, Edit Dialog, Quick Bar —
 * produces the same shape.
 */

import { createLogger } from "@/management/debug/logger";
import type { Preset, PresetType } from "@/management/preset/contract";

export type PresetSaveEntryPoint =
	| "tool-shell:easing"
	| "tool-shell:code"
	| "tool-shell:layer-comp"
	| "tool-shell:animation"
	| "tool-shell:generic"
	| "path-dialog";

export type PresetExecuteEntryPoint =
	| "workspace-tile"
	| "directory-browser:run"
	| "directory-browser:import"
	| "catalog-browser"
	| "catalog-list"
	| "edit-dialog:group"
	| "quick-bar";

export type PresetLifecycleEvent =
	| {
			kind: "preset.save.requested";
			presetId: string | null;
			type: PresetType;
			userFacingName: string;
			saveDir: string;
			fullPath: string;
			entryPoint: PresetSaveEntryPoint;
	  }
	| {
			kind: "preset.save.path-validated";
			presetId: string | null;
			inputPath: string;
			validatedPath: string;
			entryPoint: PresetSaveEntryPoint;
	  }
	| {
			kind: "preset.save.file-open";
			presetId: string | null;
			filePath: string;
			fileName: string;
			fullName: string;
			openResult: boolean;
			entryPoint: PresetSaveEntryPoint;
	  }
	| {
			kind: "preset.save.file-written";
			presetId: string | null;
			filePath: string;
			fileExists: boolean;
			canonicalPath: string;
			entryPoint: PresetSaveEntryPoint;
	  }
	| {
			kind: "preset.save.verify";
			presetId: string | null;
			input: string;
			state: "exists" | "missing" | "unverifiable";
			canonicalPath: string;
			entryPoint: PresetSaveEntryPoint;
	  }
	| {
			kind: "preset.save.persist";
			presetId: string;
			type: PresetType;
			filePath: string;
			entryPoint: PresetSaveEntryPoint;
	  }
	| {
			kind: "preset.save.failed";
			presetId: string | null;
			stage: string;
			message: string;
			entryPoint: PresetSaveEntryPoint;
	  }
	| {
			kind: "preset.execute.requested";
			presetId: string;
			type: PresetType;
			filePath: string;
			entryPoint: PresetExecuteEntryPoint;
	  }
	| {
			kind: "preset.execute.resolved";
			presetId: string;
			hostFilePath: string;
			hostFileExists: boolean;
			canonicalPath: string;
			entryPoint: PresetExecuteEntryPoint;
	  }
	| {
			kind: "preset.execute.completed";
			presetId: string;
			action: string;
			entryPoint: PresetExecuteEntryPoint;
	  }
	| {
			kind: "preset.execute.failed";
			presetId: string;
			message: string;
			filePath: string;
			entryPoint: PresetExecuteEntryPoint;
	  };

const presetLifecycleLog = createLogger("preset-execution");

const eventContext = (
	event: PresetLifecycleEvent,
): Readonly<Record<string, unknown>> => {
	const common = {
		eventKind: event.kind,
		entryPoint: event.entryPoint,
	};
	switch (event.kind) {
		case "preset.save.requested":
			return {
				...common,
				presetId: event.presetId,
				type: event.type,
				userFacingName: event.userFacingName,
				saveDir: event.saveDir,
				fullPath: event.fullPath,
			};
		case "preset.save.path-validated":
			return {
				...common,
				presetId: event.presetId,
				inputPath: event.inputPath,
				validatedPath: event.validatedPath,
			};
		case "preset.save.file-open":
			return {
				...common,
				presetId: event.presetId,
				filePath: event.filePath,
				fileName: event.fileName,
				fullName: event.fullName,
				openResult: event.openResult,
			};
		case "preset.save.file-written":
			return {
				...common,
				presetId: event.presetId,
				filePath: event.filePath,
				fileExists: event.fileExists,
				canonicalPath: event.canonicalPath,
			};
		case "preset.save.verify":
			return {
				...common,
				presetId: event.presetId,
				input: event.input,
				state: event.state,
				canonicalPath: event.canonicalPath,
			};
		case "preset.save.persist":
			return {
				...common,
				presetId: event.presetId,
				type: event.type,
				filePath: event.filePath,
			};
		case "preset.save.failed":
			return {
				...common,
				presetId: event.presetId,
				stage: event.stage,
				message: event.message,
			};
		case "preset.execute.requested":
			return {
				...common,
				presetId: event.presetId,
				type: event.type,
				filePath: event.filePath,
			};
		case "preset.execute.resolved":
			return {
				...common,
				presetId: event.presetId,
				hostFilePath: event.hostFilePath,
				hostFileExists: event.hostFileExists,
				canonicalPath: event.canonicalPath,
			};
		case "preset.execute.completed":
			return {
				...common,
				presetId: event.presetId,
				action: event.action,
			};
		case "preset.execute.failed":
			return {
				...common,
				presetId: event.presetId,
				message: event.message,
				filePath: event.filePath,
			};
		default: {
			const _exhaustive: never = event;
			return { ...common, eventKind: _exhaustive };
		}
	}
};

const stringifyValue = (value: unknown): string => {
	if (value === null || value === undefined) return String(value);
	if (typeof value === "string") {
		const escaped = value.replace(/[\n\r]/g, " ").replace(/"/g, '\\"');
		return `"${escaped}"`;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	try {
		const json = JSON.stringify(value);
		if (!json) return String(value);
		return json.replace(/[\n\r]/g, " ");
	} catch {
		return String(value);
	}
};

const formatMessage = (event: PresetLifecycleEvent): string => {
	const ctx = eventContext(event);
	const parts: string[] = [];
	for (const [k, v] of Object.entries(ctx)) {
		if (k === "eventKind") continue;
		parts.push(`${k}=${stringifyValue(v)}`);
	}
	const flat = parts.join(" ");
	return `[ty-plus:preset-lifecycle] ${event.kind} ${flat}`;
};

/**
 * Emit one `preset-execution` log entry for a lifecycle event.
 *
 * Trace-only: never throw, never mutate state. Returns synchronously so
 * call sites can fire-and-forget before delegating to the next pipeline
 * step.
 */
export const tracePresetLifecycle = (event: PresetLifecycleEvent): void => {
	const message = formatMessage(event);
	const ctx = eventContext(event);
	try {
		presetLifecycleLog.info(message, { action: event.kind, context: ctx });
	} catch {
		// The trace is observational. A logging glitch must never break a
		// real save / execute flow.
	}
};

/**
 * Wrap an execute pipeline in `preset.execute.requested` /
 * `preset.execute.completed` / `preset.execute.failed` trace events.
 *
 * The pipeline callback must resolve to `{ action }`. Any error is
 * re-thrown after logging so the caller's existing error handling
 * (notifications, status strip) keeps working.
 */
export const traceExecute = async <T extends { action: string }>(
	preset: Preset,
	entryPoint: PresetExecuteEntryPoint,
	fn: () => Promise<T>,
): Promise<T> => {
	tracePresetLifecycle({
		kind: "preset.execute.requested",
		presetId: preset.id,
		type: preset.type,
		filePath: preset.filePath,
		entryPoint,
	});
	try {
		const result = await fn();
		tracePresetLifecycle({
			kind: "preset.execute.completed",
			presetId: preset.id,
			action: result.action,
			entryPoint,
		});
		return result;
	} catch (error) {
		tracePresetLifecycle({
			kind: "preset.execute.failed",
			presetId: preset.id,
			message: error instanceof Error ? error.message : String(error),
			filePath: preset.filePath,
			entryPoint,
		});
		throw error;
	}
};
