import { cx, fieldDescriptionClass, Input } from "@ty-plus/ui";
import { type JSX, useId } from "react";

export type TokenEditorProps = {
	label: string;
	value: string;
	onChange: (value: string) => void;
	description?: string;
	className?: string;
};

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
				<div className={cx(fieldDescriptionClass)}>{description}</div>
			) : null}
		</div>
	);
}
