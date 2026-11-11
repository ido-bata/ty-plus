import { type JSX, useId } from "react";
import { Input } from "@/shared/component/fields/Input";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type TokenEditorProps = {
	label: string;
	value: string;
	onChange: (value: string) => void;
	description?: string;
	className?: string;
};

const descriptionStyle = css({
	marginTop: "1",
	fontSize: "text-xs",
	color: "text.muted",
});

export function TokenEditor({
	label,
	value,
	onChange,
	description,
	className,
}: TokenEditorProps): JSX.Element {
	const inputId = useId();

	return (
		<div className={className} data-design-token-key={description}>
			<Input
				id={inputId}
				label={label}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				uiSize="sm"
			/>
			{description ? (
				<div className={cx(descriptionStyle)}>{description}</div>
			) : null}
		</div>
	);
}
