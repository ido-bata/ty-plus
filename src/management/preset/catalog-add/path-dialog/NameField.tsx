import { Input } from "@ty-plus/ui";
import type { JSX } from "react";

export function PathDialogNameField(props: {
	name: string;
	onNameChange: (next: string) => void;
}): JSX.Element {
	const { name, onNameChange } = props;
	return (
		<Input
			label="Name"
			value={name}
			onChange={(e) => onNameChange(e.target.value)}
			placeholder="Enter name..."
			autoComplete="off"
			spellCheck={false}
			uiSize="md"
		/>
	);
}
