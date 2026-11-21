import { Button } from "@ty-plus/ui";
import type { JSX } from "react";

/**
 * Toggle chip used by the directory browser's detail filters.
 *
 * `pressed` means the entry is currently *hidden* by the filter. The state is
 * published through `aria-pressed` and the shared `Button` variants (a hidden
 * entry reads as the quieter `ghost` chip, a visible one as the outlined
 * chip) so the appearance comes from the design system instead of a local
 * `opacity` override.
 */
export function FilterToggleButton({
	pressed,
	label,
	onClick,
}: {
	pressed: boolean;
	label: string;
	onClick: () => void;
}): JSX.Element {
	return (
		<Button
			type="button"
			variant={pressed ? "ghost" : "outline"}
			uiSize="sm"
			aria-pressed={pressed}
			onClick={onClick}
		>
			{label}
		</Button>
	);
}
