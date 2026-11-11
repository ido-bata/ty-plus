import type { JSX } from "react";
import { NumberField } from "@/shared/component/fields/NumberField";

export type NumberTokenEditorProps = {
	label: string;
	value: string | number;
	onChange: (value: string) => void;
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
	description?: string;
	className?: string;
};

/** Settings token dialog numeric row — uses shared `NumberField`. */
export function NumberTokenEditor(props: NumberTokenEditorProps): JSX.Element {
	return <NumberField {...props} />;
}
