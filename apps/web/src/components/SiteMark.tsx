type SiteMarkProps = {
	className?: string;
};

/**
 * Brand mark: a 2x2 workspace-tile grid with one accent tile.
 * Provisional mark — final brand acceptance is a human decision (#275).
 */
export function SiteMark({ className }: SiteMarkProps) {
	return (
		<svg
			className={className ?? "site-logo-mark"}
			viewBox="0 0 16 16"
			aria-hidden="true"
			focusable="false"
		>
			<title>ty-plus</title>
			<rect
				x="1"
				y="1"
				width="6.6"
				height="6.6"
				rx="1.4"
				fill="var(--site-accent)"
			/>
			<rect
				x="8.4"
				y="1"
				width="6.6"
				height="6.6"
				rx="1.4"
				fill="var(--site-text)"
				opacity="0.9"
			/>
			<rect
				x="1"
				y="8.4"
				width="6.6"
				height="6.6"
				rx="1.4"
				fill="var(--site-text)"
				opacity="0.55"
			/>
			<rect
				x="8.4"
				y="8.4"
				width="6.6"
				height="6.6"
				rx="1.4"
				fill="var(--site-text)"
				opacity="0.28"
			/>
		</svg>
	);
}
