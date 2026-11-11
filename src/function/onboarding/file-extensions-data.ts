import type { FilePickStep } from "@/function/onboarding/steps-data";

/** File extensions shown in onboarding folder pickers per category */
export const STEP_EXTENSIONS: Record<FilePickStep, readonly string[]> = {
	presets: [".ffx"],
	scripts: [".jsx", ".jsxbin", ".js"],
	plugins: [".plugin", ".aex"],
};
