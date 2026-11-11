/**
 * Onboarding wizard step identifiers and display order.
 * UI copy and transitions live in `OnboardingView.tsx`.
 */

export type StepId =
	| "intro"
	| "language"
	| "support"
	| "subfolders"
	| "presets"
	| "scripts"
	| "plugins"
	| "workspace"
	| "adding-presets"
	| "finish";

export type FilePickStep = "presets" | "scripts" | "plugins";

export const STEP_SEQUENCE: readonly StepId[] = [
	"intro",
	"language",
	"support",
	"subfolders",
	"presets",
	"scripts",
	"plugins",
	"workspace",
	"adding-presets",
	"finish",
];
