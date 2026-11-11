import {
	Fragment,
	type JSX,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { applyCepShellTheme } from "@/management/panel/inject-styles";
import {
	loadCepShellThemeFromCss,
	sanitizeCepShellThemeOverrides,
	saveCepShellThemeToCss,
} from "@/management/panel/theme/storage";
import { ColorTokenEditor } from "@/management/setting/dialog/components/ColorTokenEditor";
import { NumberTokenEditor } from "@/management/setting/dialog/components/NumberTokenEditor";
import { TokenEditor } from "@/management/setting/dialog/components/TokenEditor";
import {
	SettingsField,
	SettingsGrid,
	SettingsSectionHeading,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { DEFAULT_THEME } from "@/management/style/default-values";
import { Button } from "@/shared/component/controls/Button";
import { Textarea } from "@/shared/component/fields/Textarea";
import { css } from "@/styled-system/css";

interface TokenCategory {
	name: string;
	tokens: {
		key: string;
		label: string;
		type: "color" | "text" | "opacity" | "number";
	}[];
}

const TOKEN_CATEGORIES: TokenCategory[] = [
	{
		name: "Surface Colors",
		tokens: [
			{ key: "color-ty-bg-app", label: "App Background", type: "color" },
			{ key: "color-ty-bg-surface", label: "Surface", type: "color" },
			{ key: "color-ty-widget-bg", label: "Widget Background", type: "color" },
			{ key: "color-ty-widget-border", label: "Widget Border", type: "color" },
			{
				key: "color-ty-widget-border-strong",
				label: "Widget Border Strong",
				type: "color",
			},
		],
	},
	{
		name: "Text Colors",
		tokens: [
			{ key: "text-r", label: "Text Red Channel", type: "text" },
			{ key: "text-g", label: "Text Green Channel", type: "text" },
			{ key: "text-b", label: "Text Blue Channel", type: "text" },
			{ key: "accent-r", label: "Accent Red Channel", type: "text" },
			{ key: "accent-g", label: "Accent Green Channel", type: "text" },
			{ key: "accent-b", label: "Accent Blue Channel", type: "text" },
		],
	},
	{
		name: "Text Alpha",
		tokens: [
			{
				key: "ty-opacity-text-main",
				label: "Text Primary Alpha",
				type: "opacity",
			},
			{
				key: "ty-opacity-text-muted",
				label: "Text Muted Alpha",
				type: "opacity",
			},
			{
				key: "ty-opacity-action-primary",
				label: "Action Primary Alpha",
				type: "opacity",
			},
			{
				key: "ty-opacity-border-default",
				label: "Border Default Alpha",
				type: "opacity",
			},
		],
	},
	{
		name: "Accent Colors",
		tokens: [
			{ key: "color-ty-accent", label: "Accent Color", type: "color" },
			{ key: "color-ty-accent-border", label: "Accent Border", type: "color" },
			{ key: "color-ty-accent-bg", label: "Accent Background", type: "color" },
		],
	},
	{
		name: "Interactive States",
		tokens: [
			{ key: "color-ty-ink-08", label: "Hover (8%)", type: "color" },
			{ key: "color-ty-ink-12", label: "Active (12%)", type: "color" },
		],
	},
	{
		name: "Ink Steps",
		tokens: [
			{ key: "color-ty-ink-02", label: "Ink 2%", type: "color" },
			{ key: "color-ty-ink-04", label: "Ink 4%", type: "color" },
			{ key: "color-ty-ink-06", label: "Ink 6%", type: "color" },
			{ key: "color-ty-ink-10", label: "Ink 10%", type: "color" },
			{ key: "color-ty-ink-14", label: "Ink 14%", type: "color" },
			{ key: "color-ty-ink-18", label: "Ink 18%", type: "color" },
			{ key: "color-ty-ink-22", label: "Ink 22%", type: "color" },
			{ key: "color-ty-ink-30", label: "Ink 30%", type: "color" },
		],
	},
	{
		name: "Status Colors",
		tokens: [
			{ key: "ty-status-success", label: "Success", type: "color" },
			{ key: "ty-status-warning", label: "Warning", type: "color" },
			{ key: "ty-status-error", label: "Error", type: "color" },
		],
	},
	{
		name: "Shell",
		tokens: [
			{ key: "color-ty-shell-border", label: "Shell Border", type: "color" },
			{ key: "color-ty-shell-panel", label: "Shell Panel", type: "color" },
			{ key: "color-ty-shell-text", label: "Shell Text", type: "color" },
			{ key: "color-ty-shell-muted", label: "Shell Muted", type: "color" },
		],
	},
	{
		name: "Workspace",
		tokens: [
			{ key: "color-ty-ws-error-text", label: "Error Text", type: "color" },
			{ key: "color-ty-ws-error-bg", label: "Error Background", type: "color" },
			{ key: "color-ty-ws-error-border", label: "Error Border", type: "color" },
			{ key: "color-ty-surface-muted", label: "Surface Muted", type: "color" },
		],
	},
];

const mutedTextStyle = css({
	fontSize: "text-xs",
	color: "text.muted",
});

export function TokensSection(): JSX.Element {
	const tokenKeys = useMemo(
		() =>
			TOKEN_CATEGORIES.flatMap((category) =>
				category.tokens.map((token) => token.key),
			),
		[],
	);
	const [values, setValues] = useState<Record<string, string>>({});
	const [output, setOutput] = useState("");
	const [status, setStatus] = useState<string>("");

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const stored = (await loadCepShellThemeFromCss(window)) ?? {};
			if (cancelled) {
				return;
			}
			const merged = { ...DEFAULT_THEME, ...stored };
			const next: Record<string, string> = {};
			for (const key of tokenKeys) {
				next[key] = merged[key] ?? "";
			}
			setValues(next);
		})();
		return () => {
			cancelled = true;
		};
	}, [tokenKeys]);

	const handleTokenChange = useCallback((key: string, value: string) => {
		setValues((prev) => ({ ...prev, [key]: value }));
	}, []);

	const handleExport = useCallback(() => {
		const lines: string[] = [];
		for (const [k, v] of Object.entries(values)) {
			if (v.trim()) lines.push(`  "${k}": "${v}",`);
		}
		const output = `{\n${lines.join("\n")}\n}`;
		setOutput(output);
		void navigator.clipboard.writeText(output);
		setStatus("Copied token JSON to clipboard.");
	}, [values]);

	const handleImport = useCallback(() => {
		if (!output.trim()) return;
		try {
			const parsed = JSON.parse(output) as Record<string, unknown>;
			const imported = sanitizeCepShellThemeOverrides(parsed);
			setValues((prev) => {
				const next = { ...prev };
				for (const [key, value] of Object.entries(imported)) {
					if (typeof value === "string") {
						next[key] = value;
					}
				}
				return next;
			});
			setStatus("Imported token JSON into editor values.");
		} catch {
			setStatus("Invalid JSON format.");
		}
	}, [output]);

	const handleApply = useCallback(async () => {
		const cleaned = sanitizeCepShellThemeOverrides(values);
		await saveCepShellThemeToCss(window, cleaned);
		applyCepShellTheme(document, { themeOverrides: cleaned });
		setStatus("Applied and saved tokens to theme.css.");
	}, [values]);

	const handleResetAll = useCallback(() => {
		const next: Record<string, string> = {};
		for (const key of tokenKeys) {
			next[key] = DEFAULT_THEME[key] ?? "";
		}
		setValues(next);
		setStatus("Reset all tokens to defaults (not saved until Apply & Save).");
	}, [tokenKeys]);

	const handleResetOne = useCallback((tokenKey: string) => {
		setValues((prev) => ({
			...prev,
			[tokenKey]: DEFAULT_THEME[tokenKey] ?? "",
		}));
		setStatus(`Reset ${tokenKey} to default.`);
	}, []);

	const handlersRef = useRef({
		handleApply,
		handleExport,
		handleImport,
		handleResetAll,
		handleResetOne,
	});
	useEffect(() => {
		handlersRef.current = {
			handleApply,
			handleExport,
			handleImport,
			handleResetAll,
			handleResetOne,
		};
	});

	useEffect(() => {
		const onCommand = (event: Event) => {
			const detail = (
				event as CustomEvent<{ command?: string; tokenKey?: string }>
			).detail;
			const h = handlersRef.current;
			switch (detail?.command) {
				case "tokens.apply":
					void h.handleApply();
					break;
				case "tokens.export":
					h.handleExport();
					break;
				case "tokens.import":
					h.handleImport();
					break;
				case "tokens.reset-all":
					h.handleResetAll();
					break;
				case "tokens.reset-one":
					if (detail.tokenKey) {
						h.handleResetOne(detail.tokenKey);
					}
					break;
				default:
					break;
			}
		};
		window.addEventListener("ty-plus:settings-dialog-command", onCommand);
		return () => {
			window.removeEventListener("ty-plus:settings-dialog-command", onCommand);
		};
	}, []);

	return (
		<SettingsGrid>
			<SettingsField span={6}>
				<p className={mutedTextStyle}>
					Customize Tailwind CSS design tokens. Export/Import to share
					configurations.
				</p>
			</SettingsField>

			{TOKEN_CATEGORIES.map((category) => (
				<Fragment key={category.name}>
					<SettingsSectionHeading>{category.name}</SettingsSectionHeading>
					{category.tokens.map((token) => (
						<SettingsField key={token.key} span={3}>
							<div data-design-token-key={token.key}>
								{token.type === "color" ? (
									<ColorTokenEditor
										label={token.label}
										description={token.key}
										value={values[token.key] ?? "#000000"}
										onChange={(value) => handleTokenChange(token.key, value)}
									/>
								) : token.type === "number" || token.type === "opacity" ? (
									<NumberTokenEditor
										label={token.label}
										description={token.key}
										value={values[token.key] ?? ""}
										onChange={(value) => handleTokenChange(token.key, value)}
									/>
								) : (
									<TokenEditor
										label={token.label}
										description={token.key}
										value={values[token.key] ?? ""}
										onChange={(value) => handleTokenChange(token.key, value)}
									/>
								)}
							</div>
						</SettingsField>
					))}
				</Fragment>
			))}

			<SettingsSectionHeading>Export / Import</SettingsSectionHeading>
			<SettingsField span={6}>
				<div data-settings-tokens-io>
					<Textarea
						value={output}
						onChange={(e) => setOutput(e.target.value)}
						placeholder="JSON configuration will appear here after export"
						rows={4}
					/>
				</div>
			</SettingsField>
			<SettingsField span={6}>
				<Button variant="primary" uiSize="sm" onClick={handleApply}>
					Apply & Save
				</Button>
				<Button variant="primary" uiSize="sm" onClick={handleExport}>
					Export to Clipboard
				</Button>
				<Button variant="default" uiSize="sm" onClick={handleImport}>
					Import from Text
				</Button>
			</SettingsField>
			{status ? (
				<SettingsField span={6}>
					<span className={mutedTextStyle}>{status}</span>
				</SettingsField>
			) : null}
		</SettingsGrid>
	);
}
