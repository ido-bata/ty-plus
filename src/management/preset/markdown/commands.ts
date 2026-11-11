export type EditorState = {
	value: string;
	selection: { start: number; end: number };
};

export type Command = (state: EditorState) => EditorState;
export type HeadingLevel = 1 | 2 | 3;

const findLineRange = (
	value: string,
	offset: number,
): { lineStart: number; lineEnd: number } => {
	const lineStart = value.lastIndexOf("\n", offset - 1) + 1;
	let lineEnd = value.indexOf("\n", offset);
	if (lineEnd === -1) lineEnd = value.length;
	return { lineStart, lineEnd };
};

const isWrapped = (
	value: string,
	start: number,
	end: number,
	marker: string,
): boolean =>
	value.slice(start - marker.length, start) === marker &&
	value.slice(end, end + marker.length) === marker;

const wrap = (state: EditorState, marker: string): EditorState => {
	const { value, selection } = state;
	const before = value.slice(0, selection.start);
	const inner = value.slice(selection.start, selection.end);
	const after = value.slice(selection.end);
	const newValue = `${before}${marker}${inner}${marker}${after}`;
	const newStart = selection.start + marker.length;
	const newEnd = newStart + inner.length;
	return { value: newValue, selection: { start: newStart, end: newEnd } };
};

const unwrap = (state: EditorState, marker: string): EditorState => {
	const { value, selection } = state;
	const before = value.slice(0, selection.start - marker.length);
	const inner = value.slice(selection.start, selection.end);
	const after = value.slice(selection.end + marker.length);
	const newValue = `${before}${inner}${after}`;
	return {
		value: newValue,
		selection: { start: before.length, end: before.length + inner.length },
	};
};

export const toggleBold: Command = (state) => {
	if (
		state.selection.start !== state.selection.end &&
		isWrapped(state.value, state.selection.start, state.selection.end, "**")
	) {
		return unwrap(state, "**");
	}
	return wrap(state, "**");
};

export const toggleItalic: Command = (state) => {
	if (
		state.selection.start !== state.selection.end &&
		isWrapped(state.value, state.selection.start, state.selection.end, "_")
	) {
		return unwrap(state, "_");
	}
	return wrap(state, "_");
};

export const toggleCode: Command = (state) => {
	if (
		state.selection.start !== state.selection.end &&
		isWrapped(state.value, state.selection.start, state.selection.end, "`")
	) {
		return unwrap(state, "`");
	}
	return wrap(state, "`");
};

export const toggleLink: Command = (state) => {
	const { value, selection } = state;
	const hasSelection = selection.start !== selection.end;
	const text = hasSelection
		? value.slice(selection.start, selection.end)
		: "text";
	const before = value.slice(0, selection.start);
	const after = value.slice(selection.end);
	const insertion = `[${text}](url)`;
	const newValue = `${before}${insertion}${after}`;
	const urlStart = before.length + text.length + 3; // [text](
	const urlEnd = urlStart + 3; // "url"
	return { value: newValue, selection: { start: urlStart, end: urlEnd } };
};

const toggleLinePrefix = (
	state: EditorState,
	prefix: string,
	toggleOff: (line: string) => boolean,
	prefixOff: (line: string) => string,
): EditorState => {
	const { value, selection } = state;
	const cursor = selection.start;
	const { lineStart, lineEnd } = findLineRange(value, cursor);
	const line = value.slice(lineStart, lineEnd);
	const before = value.slice(0, lineStart);
	const after = value.slice(lineEnd);

	let newLine: string;
	let newCursorOffset: number;
	if (toggleOff(line)) {
		newLine = prefixOff(line);
		newCursorOffset = cursor - lineStart - prefix.length;
		if (newCursorOffset < 0) newCursorOffset = 0;
	} else {
		newLine = `${prefix}${line}`;
		newCursorOffset = cursor - lineStart + prefix.length;
	}
	const newValue = `${before}${newLine}${after}`;
	const newCursor = lineStart + newCursorOffset;
	return {
		value: newValue,
		selection: { start: newCursor, end: newCursor },
	};
};

export const toggleHeading = (
	state: EditorState,
	level: HeadingLevel,
): EditorState => {
	const { value, selection } = state;
	const cursor = selection.start;
	const { lineStart, lineEnd } = findLineRange(value, cursor);
	const line = value.slice(lineStart, lineEnd);
	const before = value.slice(0, lineStart);
	const after = value.slice(lineEnd);

	const headingMatch = /^(#{1,3}) /.exec(line);
	const newPrefix = `${"#".repeat(level)} `;

	let newLine: string;
	let newCursor: number;
	if (!headingMatch) {
		newLine = `${newPrefix}${line}`;
		newCursor = lineStart + newPrefix.length + (cursor - lineStart);
	} else {
		const existingPrefix = headingMatch[0];
		if (existingPrefix === newPrefix) {
			newLine = line.slice(existingPrefix.length);
			newCursor =
				lineStart + Math.max(0, cursor - lineStart - existingPrefix.length);
		} else {
			newLine = `${newPrefix}${line.slice(existingPrefix.length)}`;
			const cursorInLine = cursor - lineStart;
			const adjusted =
				cursorInLine < existingPrefix.length
					? newPrefix.length
					: cursorInLine - existingPrefix.length + newPrefix.length;
			newCursor = lineStart + adjusted;
		}
	}

	return {
		value: `${before}${newLine}${after}`,
		selection: { start: newCursor, end: newCursor },
	};
};

export const toggleBulletList: Command = (state) =>
	toggleLinePrefix(
		state,
		"- ",
		(line) => line.startsWith("- "),
		(line) => line.slice(2),
	);

export const toggleOrderedList: Command = (state) =>
	toggleLinePrefix(
		state,
		"1. ",
		(line) => /^\d+\.\s/.test(line),
		(line) => line.replace(/^\d+\.\s/, ""),
	);
