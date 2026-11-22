import { Input } from "@ty-plus/ui/fields/Input";
import { cx } from "@ty-plus/ui/util/cx";
import { type JSX, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@/styled-system/css";

export type RegexEditorProps = {
	value: string;
	onChange: (next: string) => void;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
};

type ParsedRegex = {
	source: string;
	flags: string;
	isLiteral: boolean;
};

const VALID_FLAGS = new Set(["d", "g", "i", "m", "s", "u", "v", "y"]);

const parseRegexValue = (value: string): ParsedRegex => {
	const trimmed = value.trim();
	if (trimmed.startsWith("/") && trimmed.lastIndexOf("/") > 0) {
		const last = trimmed.lastIndexOf("/");
		return {
			source: trimmed.slice(1, last),
			flags: trimmed.slice(last + 1),
			isLiteral: true,
		};
	}
	return { source: value, flags: "", isLiteral: false };
};

const composeRegexValue = (
	source: string,
	flags: string,
	isLiteral: boolean,
): string => {
	const nextSource = source;
	const nextFlags = flags.replace(/[^dgimsuvy]/g, "");
	if (!nextFlags && !isLiteral) {
		return nextSource;
	}
	return `/${nextSource.replace(/\//g, "\\/")}/${nextFlags}`;
};

const outerGrid = css({
	display: "grid",
	minWidth: 0,
	gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
	gap: "2",
});

const rowGrid = css({
	gridColumn: "span 12",
	display: "grid",
	minWidth: 0,
	gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
	gap: "2",
});

const sourceInput = css({
	gridColumn: "span 8",
	width: "full",
	fontFamily: "mono",
});
const flagsInput = css({
	gridColumn: "span 4",
	width: "full",
	fontFamily: "mono",
});
const sampleInput = css({ gridColumn: "span 12", width: "full" });

const statusRow = css({
	gridColumn: "span 12",
	fontSize: "text-xs",
});

const statusOk = css({ color: "text.muted" });
const statusError = css({ color: "status.error" });

export function RegexEditor({
	value,
	onChange,
	placeholder,
	disabled = false,
	className = "",
}: RegexEditorProps): JSX.Element {
	const { t } = useTranslation();
	const [sample, setSample] = useState("");

	const parsed = useMemo(() => parseRegexValue(value), [value]);

	const validation = useMemo(() => {
		if (!parsed.source.trim()) {
			return {
				ok: true,
				message: t("ui.regexEditor.enterPattern", {
					defaultValue: "Enter a pattern.",
				}),
			};
		}
		const invalidFlags = parsed.flags
			.split("")
			.filter((flag) => !VALID_FLAGS.has(flag));
		if (invalidFlags.length > 0) {
			return {
				ok: false,
				message: t("ui.regexEditor.invalidFlags", {
					flags: invalidFlags.join(", "),
					defaultValue: `Invalid flags: ${invalidFlags.join(", ")}`,
				}),
			};
		}
		try {
			new RegExp(parsed.source, parsed.flags);
			const message = parsed.isLiteral
				? t("ui.regexEditor.literalFormat", {
						defaultValue: "Literal regex format",
					})
				: t("ui.regexEditor.plainSource", {
						defaultValue: "Plain regex source",
					});
			return {
				ok: true,
				message,
			};
		} catch (e) {
			let message = String(e);
			if (e instanceof Error) message = e.message;
			return { ok: false, message };
		}
	}, [parsed, t]);

	const sampleResult = useMemo(() => {
		if (!validation.ok || !sample.trim()) {
			return null;
		}
		const regex = new RegExp(parsed.source, parsed.flags);
		const match = regex.exec(sample);
		return match
			? `${t("ui.regexEditor.matches", { defaultValue: "Matches" })}${match[0] ? `: ${match[0]}` : ""}`
			: t("ui.regexEditor.noMatch", { defaultValue: "No match" });
	}, [validation.ok, sample, parsed, t]);

	return (
		<div className={cx(outerGrid, className)}>
			<div className={rowGrid}>
				<Input
					value={parsed.source}
					onChange={(e) =>
						onChange(
							composeRegexValue(
								e.currentTarget.value,
								parsed.flags,
								parsed.isLiteral,
							),
						)
					}
					placeholder={
						placeholder ??
						t("ui.regexEditor.sourcePlaceholder", {
							defaultValue: "Regex source",
						})
					}
					disabled={disabled}
					uiSize="sm"
					className={sourceInput}
				/>
				<Input
					value={parsed.flags}
					onChange={(e) =>
						onChange(
							composeRegexValue(parsed.source, e.currentTarget.value, true),
						)
					}
					placeholder={t("ui.regexEditor.flagsPlaceholder", {
						defaultValue: "flags",
					})}
					disabled={disabled}
					uiSize="sm"
					className={flagsInput}
				/>
			</div>
			<div className={rowGrid}>
				<Input
					value={sample}
					onChange={(e) => setSample(e.currentTarget.value)}
					placeholder={t("ui.regexEditor.testString", {
						defaultValue: "Test string",
					})}
					disabled={disabled}
					uiSize="sm"
					className={sampleInput}
				/>
			</div>
			<div className={cx(statusRow, validation.ok ? statusOk : statusError)}>
				{validation.message}{" "}
				{parsed.isLiteral
					? t("ui.regexEditor.literalSuffix", {
							defaultValue: "· literal /pattern/flags",
						})
					: t("ui.regexEditor.sourceSuffix", { defaultValue: "· source only" })}
				{sampleResult ? ` · ${sampleResult}` : ""}
			</div>
		</div>
	);
}
