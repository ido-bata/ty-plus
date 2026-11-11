import type { JSX } from "react";
import { ColorField } from "@/shared/component/fields/ColorField";

export type ColorTokenEditorProps = {
	label: string;
	value: string;
	onChange: (value: string) => void;
	description?: string;
	className?: string;
};

/** Settings token dialog color row — uses shared `ColorField`. */
export function ColorTokenEditor(props: ColorTokenEditorProps): JSX.Element {
	return <ColorField {...props} />;
}
