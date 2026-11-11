import { type JSX, useMemo, useState } from "react";
import { Input } from "@/shared/component/fields/Input";
import { cx } from "@/shared/util/cx";
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
	const [sample, setSample] = useState("");

	const parsed = useMemo(() => parseRegexValue(value), [value]);

	const validation = useMemo(() => {
		if (!parsed.source.trim()) {
			return { ok: true, message: "Enter a pattern." };
		}
		const invalidFlags = parsed.flags
			.split("")
			.filter((flag) => !VALID_FLAGS.has(flag));
		if (invalidFlags.length > 0) {
			return {
				ok: false,
				message: `Invalid flags: ${invalidFlags.join(", ")}`,
			};
		}
		try {
			new RegExp(parsed.source, parsed.flags);
			let message = "Plain regex source";
			if (parsed.isLiteral) message = "Literal regex format";
			return {
				ok: true,
				message,
			};
		} catch (e) {
			let message = String(e);
			if (e instanceof Error) message = e.message;
			return { ok: false, message };
		}
	}, [parsed]);

	const sampleResult = useMemo(() => {
		if (!validation.ok || !sample.trim()) {
			return null;
		}
		const regex = new RegExp(parsed.source, parsed.flags);
		const match = regex.exec(sample);
		return match ? `Matches${match[0] ? `: ${match[0]}` : ""}` : "No match";
	}, [validation.ok, sample, parsed]);

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
					placeholder={placeholder ?? "Regex source"}
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
					placeholder="flags"
					disabled={disabled}
					uiSize="sm"
					className={flagsInput}
				/>
			</div>
			<div className={rowGrid}>
				<Input
					value={sample}
					onChange={(e) => setSample(e.currentTarget.value)}
					placeholder="Test string"
					disabled={disabled}
					uiSize="sm"
					className={sampleInput}
				/>
			</div>
			<div className={cx(statusRow, validation.ok ? statusOk : statusError)}>
				{validation.message}{" "}
				{parsed.isLiteral ? "· literal /pattern/flags" : "· source only"}
				{sampleResult ? ` · ${sampleResult}` : ""}
			</div>
		</div>
	);
}
