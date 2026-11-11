import type { JSX } from "react";
import type { CodeEditorValue } from "@/management/preset/editor/Code";
import { CodeEditor } from "@/management/preset/editor/Code";

type EditorProps = {
	value: CodeEditorValue;
	onChange: (value: CodeEditorValue) => void;
	language?: string;
	readOnly?: boolean;
	className?: string;
};

function CodeView(props: EditorProps): JSX.Element {
	return <CodeEditor {...props} />;
}

export { CodeView as Editor };
