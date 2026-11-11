export type CpPosition =
	| "top-left"
	| "top-center"
	| "top-right"
	| "bottom-left"
	| "bottom-center"
	| "bottom-right"
	| "left-top"
	| "left-center"
	| "left-bottom"
	| "right-top"
	| "right-center"
	| "right-bottom";

export type CpOrientation = "horizontal" | "vertical";

export type CpPersistedState = {
	position: CpPosition;
	orientation: CpOrientation;
	collapsed: boolean;
};
