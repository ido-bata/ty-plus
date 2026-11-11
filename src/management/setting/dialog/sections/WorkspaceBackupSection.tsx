import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { SettingsGrid } from "@/management/setting/dialog/layout/SettingsGrid";
import {
	readBackgroundJson,
	readNJson,
	readPresetsJson,
	readSettings,
	readThemeCss,
	writeBackgroundJson,
	writeNJson,
	writePresetsJson,
	writeSettings,
	writeThemeCss,
} from "@/management/storage";
import { Button } from "@/shared/component/controls/Button";
import { Textarea } from "@/shared/component/fields/Textarea";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

type WorkspaceBackupBundle = {
	version: 1;
	exportedAt: string;
	settingsJson: string | null;
	presetsJson: string | null;
	themeCss: string | null;
	panelLayouts: Partial<Record<"1" | "2" | "3" | "4" | "5", string | null>>;
	panelBackgrounds: Partial<Record<"1" | "2" | "3" | "4" | "5", string | null>>;
};

const mutedTextStyle = css({
	fontSize: "text-xs",
	color: "text.muted",
});

const bundleContainerStyle = css({
	gridColumn: "span 6 / span 6",
});

const buttonsRowStyle = css({
	gridColumn: "span 6 / span 6",
	display: "grid",
	width: "full",
	minWidth: 0,
	gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
	gap: "var(--ty-shell-space)",
});

const exportButtonStyle = css({
	gridColumn: "span 3 / span 3",
	width: "full",
});

const importButtonStyle = css({
	gridColumn: "span 3 / span 3",
	width: "full",
});

export function WorkspaceBackupSection(): JSX.Element {
	const [bundleText, setBundleText] = useState("");
	const [status, setStatus] = useState<string>("");

	const handleExport = useCallback(async () => {
		const indices = [1, 2, 3, 4, 5] as const;
		const [settingsJson, presetsJson, themeCss, layouts, backgrounds] =
			await Promise.all([
				readSettings(window),
				readPresetsJson(window),
				readThemeCss(window),
				Promise.all(indices.map((index) => readNJson(window, index))),
				Promise.all(indices.map((index) => readBackgroundJson(window, index))),
			]);
		const panelLayouts: WorkspaceBackupBundle["panelLayouts"] = {};
		const panelBackgrounds: WorkspaceBackupBundle["panelBackgrounds"] = {};
		for (const [idx, index] of indices.entries()) {
			panelLayouts[
				String(index) as keyof WorkspaceBackupBundle["panelLayouts"]
			] = layouts[idx] ?? null;
			panelBackgrounds[
				String(index) as keyof WorkspaceBackupBundle["panelBackgrounds"]
			] = backgrounds[idx] ?? null;
		}
		const bundle: WorkspaceBackupBundle = {
			version: 1,
			exportedAt: new Date().toISOString(),
			settingsJson,
			presetsJson,
			themeCss,
			panelLayouts,
			panelBackgrounds,
		};
		const text = `${JSON.stringify(bundle, null, 2)}\n`;
		setBundleText(text);
		void navigator.clipboard.writeText(text);
		setStatus("Exported workspace backup JSON and copied to clipboard.");
	}, []);

	const handleImport = useCallback(async () => {
		if (!bundleText.trim()) {
			setStatus("Paste backup JSON first.");
			return;
		}
		const execImportBackup = async () => {
			const parsed = JSON.parse(bundleText) as Partial<WorkspaceBackupBundle>;
			if (typeof parsed.settingsJson === "string") {
				await writeSettings(window, parsed.settingsJson);
			}
			if (typeof parsed.presetsJson === "string") {
				await writePresetsJson(window, parsed.presetsJson);
			}
			if (typeof parsed.themeCss === "string") {
				await writeThemeCss(window, parsed.themeCss);
			}
			const indices = [1, 2, 3, 4, 5] as const;
			await Promise.all(
				indices.map(async (index) => {
					const key = String(index) as keyof NonNullable<
						WorkspaceBackupBundle["panelLayouts"]
					>;
					const panelLayouts = parsed.panelLayouts;
					const layoutRaw =
						panelLayouts != null ? panelLayouts[key] : undefined;
					if (typeof layoutRaw === "string") {
						if (layoutRaw.trim()) {
							await writeNJson(window, index, layoutRaw);
						}
					}
					const panelBackgrounds = parsed.panelBackgrounds;
					const bgRaw =
						panelBackgrounds != null ? panelBackgrounds[key] : undefined;
					if (typeof bgRaw === "string") {
						if (bgRaw.trim()) {
							await writeBackgroundJson(window, index, bgRaw);
						}
					}
				}),
			);
			setStatus("Imported workspace backup. Reopen dialogs/panels to refresh.");
		};
		try {
			await execImportBackup();
		} catch {
			setStatus("Invalid backup JSON.");
		}
	}, [bundleText]);

	const handlersRef = useRef({ handleExport, handleImport });
	useEffect(() => {
		handlersRef.current = { handleExport, handleImport };
	});

	useEffect(() => {
		const onCommand = (event: Event) => {
			const detail = (event as CustomEvent<{ command?: string }>).detail;
			if (detail?.command === "backup.export") {
				void handlersRef.current.handleExport();
			} else if (detail?.command === "backup.import") {
				void handlersRef.current.handleImport();
			}
		};
		window.addEventListener("ty-plus:settings-dialog-command", onCommand);
		return () => {
			window.removeEventListener("ty-plus:settings-dialog-command", onCommand);
		};
	}, []);

	return (
		<SettingsGrid>
			<p className={cx(bundleContainerStyle, mutedTextStyle)}>
				Export or import your workspace configuration.
			</p>
			<div className={bundleContainerStyle} data-settings-backup-bundle>
				<Textarea
					value={bundleText}
					onChange={(e) => setBundleText(e.target.value)}
					rows={8}
					placeholder="Workspace backup JSON"
				/>
			</div>
			<div className={buttonsRowStyle}>
				<Button
					onClick={handleExport}
					variant="default"
					uiSize="sm"
					className={exportButtonStyle}
				>
					Export
				</Button>
				<Button
					onClick={handleImport}
					variant="default"
					uiSize="sm"
					className={importButtonStyle}
				>
					Import
				</Button>
			</div>
			{status ? (
				<p className={cx(bundleContainerStyle, mutedTextStyle)}>{status}</p>
			) : null}
		</SettingsGrid>
	);
}
