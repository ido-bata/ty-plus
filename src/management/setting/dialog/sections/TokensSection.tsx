import { Button } from "@ty-plus/ui/controls/Button";
import { Textarea } from "@ty-plus/ui/fields/Textarea";
import {
	Fragment,
	type JSX,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { i18n } from "@/management/i18n/index";
import { applyCepShellTheme } from "@/management/panel/inject-styles";
import {
	loadCepShellThemeFromCss,
	loadCepShellThemeOverridesForWrite,
	sanitizeCepShellThemeOverrides,
	saveCepShellThemeToCss,
} from "@/management/panel/theme/storage";
import { enqueueThemeWrite } from "@/management/panel/theme/write-queue";
import { ColorTokenEditor } from "@/management/setting/dialog/components/ColorTokenEditor";
import { NumberTokenEditor } from "@/management/setting/dialog/components/NumberTokenEditor";
import { TokenEditor } from "@/management/setting/dialog/components/TokenEditor";
import {
	SettingsField,
	SettingsGrid,
	SettingsSectionHeading,
} from "@/management/setting/dialog/layout/SettingsGrid";
import { DEFAULT_THEME } from "@/management/style/default-values";
import { css } from "@/styled-system/css";

interface TokenCategory {
	nameKey: string;
	tokens: {
		key: string;
		labelKey: string;
		type: "color" | "text" | "opacity" | "number";
	}[];
}

const TOKEN_CATEGORIES: TokenCategory[] = [
	{
		nameKey: "settings:tokensSection.categories.surfaceColors",
		tokens: [
			{
				key: "color-ty-bg-app",
				labelKey: "settings:tokensSection.tokens.appBackground",
				type: "color",
			},
			{
				key: "color-ty-bg-surface",
				labelKey: "settings:tokensSection.tokens.surface",
				type: "color",
			},
			{
				key: "color-ty-widget-bg",
				labelKey: "settings:tokensSection.tokens.widgetBackground",
				type: "color",
			},
			{
				key: "color-ty-widget-border",
				labelKey: "settings:tokensSection.tokens.widgetBorder",
				type: "color",
			},
			{
				key: "color-ty-widget-border-strong",
				labelKey: "settings:tokensSection.tokens.widgetBorderStrong",
				type: "color",
			},
		],
	},
	{
		nameKey: "settings:tokensSection.categories.textColors",
		tokens: [
			{
				key: "text-r",
				labelKey: "settings:tokensSection.tokens.textRedChannel",
				type: "text",
			},
			{
				key: "text-g",
				labelKey: "settings:tokensSection.tokens.textGreenChannel",
				type: "text",
			},
			{
				key: "text-b",
				labelKey: "settings:tokensSection.tokens.textBlueChannel",
				type: "text",
			},
			{
				key: "accent-r",
				labelKey: "settings:tokensSection.tokens.accentRedChannel",
				type: "text",
			},
			{
				key: "accent-g",
				labelKey: "settings:tokensSection.tokens.accentGreenChannel",
				type: "text",
			},
			{
				key: "accent-b",
				labelKey: "settings:tokensSection.tokens.accentBlueChannel",
				type: "text",
			},
		],
	},
	{
		nameKey: "settings:tokensSection.categories.textAlpha",
		tokens: [
			{
				key: "ty-opacity-text-main",
				labelKey: "settings:tokensSection.tokens.textPrimaryAlpha",
				type: "opacity",
			},
			{
				key: "ty-opacity-text-muted",
				labelKey: "settings:tokensSection.tokens.textMutedAlpha",
				type: "opacity",
			},
			{
				key: "ty-opacity-action-primary",
				labelKey: "settings:tokensSection.tokens.actionPrimaryAlpha",
				type: "opacity",
			},
			{
				key: "ty-opacity-border-default",
				labelKey: "settings:tokensSection.tokens.borderDefaultAlpha",
				type: "opacity",
			},
		],
	},
	{
		nameKey: "settings:tokensSection.categories.accentColors",
		tokens: [
			{
				key: "color-ty-accent",
				labelKey: "settings:tokensSection.tokens.accentColor",
				type: "color",
			},
			{
				key: "color-ty-accent-border",
				labelKey: "settings:tokensSection.tokens.accentBorder",
				type: "color",
			},
			{
				key: "color-ty-accent-bg",
				labelKey: "settings:tokensSection.tokens.accentBackground",
				type: "color",
			},
		],
	},
	{
		nameKey: "settings:tokensSection.categories.interactiveStates",
		tokens: [
			{
				key: "color-ty-ink-08",
				labelKey: "settings:tokensSection.tokens.hoverState",
				type: "color",
			},
			{
				key: "color-ty-ink-12",
				labelKey: "settings:tokensSection.tokens.activeState",
				type: "color",
			},
		],
	},
	{
		nameKey: "settings:tokensSection.categories.inkSteps",
		tokens: [
			{
				key: "color-ty-ink-02",
				labelKey: "settings:tokensSection.tokens.ink02",
				type: "color",
			},
			{
				key: "color-ty-ink-04",
				labelKey: "settings:tokensSection.tokens.ink04",
				type: "color",
			},
			{
				key: "color-ty-ink-06",
				labelKey: "settings:tokensSection.tokens.ink06",
				type: "color",
			},
			{
				key: "color-ty-ink-10",
				labelKey: "settings:tokensSection.tokens.ink10",
				type: "color",
			},
			{
				key: "color-ty-ink-14",
				labelKey: "settings:tokensSection.tokens.ink14",
				type: "color",
			},
			{
				key: "color-ty-ink-18",
				labelKey: "settings:tokensSection.tokens.ink18",
				type: "color",
			},
			{
				key: "color-ty-ink-22",
				labelKey: "settings:tokensSection.tokens.ink22",
				type: "color",
			},
			{
				key: "color-ty-ink-30",
				labelKey: "settings:tokensSection.tokens.ink30",
				type: "color",
			},
		],
	},
	{
		nameKey: "settings:tokensSection.categories.statusColors",
		tokens: [
			{
				key: "ty-status-success",
				labelKey: "settings:tokensSection.tokens.success",
				type: "color",
			},
			{
				key: "ty-status-warning",
				labelKey: "settings:tokensSection.tokens.warning",
				type: "color",
			},
			{
				key: "ty-status-error",
				labelKey: "settings:tokensSection.tokens.error",
				type: "color",
			},
		],
	},
	{
		nameKey: "settings:tokensSection.categories.shell",
		tokens: [
			{
				key: "color-ty-shell-border",
				labelKey: "settings:tokensSection.tokens.shellBorder",
				type: "color",
			},
			{
				key: "color-ty-shell-panel",
				labelKey: "settings:tokensSection.tokens.shellPanel",
				type: "color",
			},
			{
				key: "color-ty-shell-text",
				labelKey: "settings:tokensSection.tokens.shellText",
				type: "color",
			},
			{
				key: "color-ty-shell-muted",
				labelKey: "settings:tokensSection.tokens.shellMuted",
				type: "color",
			},
		],
	},
	{
		nameKey: "settings:tokensSection.categories.workspace",
		tokens: [
			{
				key: "color-ty-ws-error-text",
				labelKey: "settings:tokensSection.tokens.errorText",
				type: "color",
			},
			{
				key: "color-ty-ws-error-bg",
				labelKey: "settings:tokensSection.tokens.errorBackground",
				type: "color",
			},
			{
				key: "color-ty-ws-error-border",
				labelKey: "settings:tokensSection.tokens.errorBorder",
				type: "color",
			},
			{
				key: "color-ty-surface-muted",
				labelKey: "settings:tokensSection.tokens.surfaceMuted",
				type: "color",
			},
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
		setStatus(i18n.t("settings:tokensSection.statusCopied"));
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
			setStatus(i18n.t("settings:tokensSection.statusImported"));
		} catch {
			setStatus(i18n.t("settings:tokensSection.statusInvalidJson"));
		}
	}, [output]);

	const handleApply = useCallback(async () => {
		const cleaned = sanitizeCepShellThemeOverrides(values);
		// theme.css is shared with other token domains (e.g. workspace grid
		// metrics). Replace only the keys this editor owns so Apply does not
		// drop overrides written by GridSection or backup restores. The
		// read-modify-write runs inside the shared per-window queue and uses
		// the strict reader so an I/O failure aborts instead of erasing the
		// file (Issue #91 review).
		try {
			await enqueueThemeWrite(window, async () => {
				const fromCss = await loadCepShellThemeOverridesForWrite(window);
				const merged: Record<string, string> = { ...fromCss };
				for (const key of tokenKeys) {
					delete merged[key];
					const value = cleaned[key];
					if (typeof value === "string") {
						merged[key] = value;
					}
				}
				await saveCepShellThemeToCss(window, merged);
				applyCepShellTheme(document, { themeOverrides: merged });
			});
			setStatus(i18n.t("settings:tokensSection.statusApplied"));
		} catch {
			setStatus(i18n.t("settings:tokensSection.statusApplyFailed"));
		}
	}, [values, tokenKeys]);

	const handleResetAll = useCallback(() => {
		const next: Record<string, string> = {};
		for (const key of tokenKeys) {
			next[key] = DEFAULT_THEME[key] ?? "";
		}
		setValues(next);
		setStatus(i18n.t("settings:tokensSection.statusResetAll"));
	}, [tokenKeys]);

	const handleResetOne = useCallback((tokenKey: string) => {
		setValues((prev) => ({
			...prev,
			[tokenKey]: DEFAULT_THEME[tokenKey] ?? "",
		}));
		setStatus(
			i18n.t("settings:tokensSection.statusResetOne", { key: tokenKey }),
		);
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
					{i18n.t("settings:tokensSection.intro")}
				</p>
			</SettingsField>

			{TOKEN_CATEGORIES.map((category) => (
				<Fragment key={category.nameKey}>
					<SettingsSectionHeading>
						{i18n.t(category.nameKey)}
					</SettingsSectionHeading>
					{category.tokens.map((token) => (
						<SettingsField key={token.key} span={3}>
							<div data-design-token-key={token.key}>
								{token.type === "color" ? (
									<ColorTokenEditor
										label={i18n.t(token.labelKey)}
										description={token.key}
										value={values[token.key] ?? "#000000"}
										onChange={(value) => handleTokenChange(token.key, value)}
									/>
								) : token.type === "number" || token.type === "opacity" ? (
									<NumberTokenEditor
										label={i18n.t(token.labelKey)}
										description={token.key}
										value={values[token.key] ?? ""}
										onChange={(value) => handleTokenChange(token.key, value)}
									/>
								) : (
									<TokenEditor
										label={i18n.t(token.labelKey)}
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

			<SettingsSectionHeading>
				{i18n.t("settings:tokensSection.exportImport")}
			</SettingsSectionHeading>
			<SettingsField span={6}>
				<div data-settings-tokens-io>
					<Textarea
						value={output}
						onChange={(e) => setOutput(e.target.value)}
						placeholder={i18n.t("settings:tokensSection.jsonPlaceholder")}
						rows={4}
					/>
				</div>
			</SettingsField>
			<SettingsField span={6}>
				<Button variant="primary" uiSize="sm" onClick={handleApply}>
					{i18n.t("settings:tokensSection.applyAndSave")}
				</Button>
				<Button variant="primary" uiSize="sm" onClick={handleExport}>
					{i18n.t("settings:tokensSection.exportToClipboard")}
				</Button>
				<Button variant="default" uiSize="sm" onClick={handleImport}>
					{i18n.t("settings:tokensSection.importFromText")}
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
