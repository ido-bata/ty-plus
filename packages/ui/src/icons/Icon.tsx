/**
 * Icon wrapper for Lucide icons
 * Accepts Tailwind size tokens (3=12px, 4=16px, 5=20px)
 */

import type { LucideIcon } from "lucide-react";

import type { JSX } from "react";

export type IconProps = {
	icon: LucideIcon;
	/** Icon size in pixels */
	size?: number;
	className?: string;
	strokeWidth?: number;
	"aria-hidden"?: boolean;
};

const SIZE_MAP = {
	3: 12,
	4: 16,
	5: 20,
} as const;

function resolveLucidePixelSize(size: IconProps["size"]): number {
	if (size == null) {
		return SIZE_MAP[4];
	}
	const mapped = SIZE_MAP[size as keyof typeof SIZE_MAP];
	if (mapped != null) {
		return mapped;
	}
	if (
		typeof size === "number" &&
		Number.isFinite(size) &&
		size > 0 &&
		size < 512
	) {
		return size;
	}
	return SIZE_MAP[4];
}

export function Icon({
	icon: IconComponent,
	size = 4,
	className,
	strokeWidth,
	"aria-hidden": ariaHidden,
}: IconProps): JSX.Element {
	const px = resolveLucidePixelSize(size);
	const sw = strokeWidth ?? (px <= 12 ? 1.75 : px <= 16 ? 2 : 2.25);
	return (
		<IconComponent
			size={px}
			strokeWidth={sw}
			className={className}
			aria-hidden={ariaHidden}
		/>
	);
}
