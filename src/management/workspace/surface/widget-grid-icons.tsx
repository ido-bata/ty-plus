import type { JSX, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
	size?: number;
};

const Svg = ({ size = 20, children, ...props }: IconProps): JSX.Element => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		aria-hidden="true"
		focusable="false"
		{...props}
	>
		{children}
	</svg>
);

export function SearchIcon(props: IconProps): JSX.Element {
	return (
		<Svg size={14} fill="none" stroke="currentColor" strokeWidth={2} {...props}>
			<circle cx="11" cy="11" r="8" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		</Svg>
	);
}

export function LockIcon(props: IconProps): JSX.Element {
	return (
		<Svg fill="currentColor" {...props}>
			<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
		</Svg>
	);
}

export function UnlockIcon(props: IconProps): JSX.Element {
	return (
		<Svg fill="currentColor" {...props}>
			<path d="M12 1C9.24 1 7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2h-7V6c0-1.66 1.34-3 3-3s3 1.34 3 3h2c0-2.76-2.24-5-5-5zm0 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
		</Svg>
	);
}

export function MenuIcon(props: IconProps): JSX.Element {
	return (
		<Svg fill="currentColor" {...props}>
			<path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
		</Svg>
	);
}

const GUIDE = 1.0;
const RECT_W_SMALL = 7;
const RECT_W_LARGE = 11;
const RECT_H = 4;
const RECT_V_SMALL = 7;
const RECT_V_LARGE = 11;
const RECT_V_W = 4;
const ALIGN_LINE = { stroke: "currentColor", strokeWidth: GUIDE };
const ALIGN_RECT = { fill: "currentColor" };

export function AlignIcon({ name }: { name: string }): JSX.Element {
	return (
		<Svg size={20} shapeRendering="geometricPrecision">
			{name === "align-left" && (
				<>
					<line x1="5" y1="4" x2="5" y2="20" {...ALIGN_LINE} />
					<rect
						x="6"
						y="7"
						width={RECT_W_SMALL}
						height={RECT_H}
						{...ALIGN_RECT}
					/>
					<rect
						x="6"
						y="13"
						width={RECT_W_LARGE}
						height={RECT_H}
						{...ALIGN_RECT}
					/>
				</>
			)}
			{name === "align-center-h" && (
				<>
					<line x1="12" y1="4" x2="12" y2="20" {...ALIGN_LINE} />
					<rect x="8" y="7" width="8" height={RECT_H} {...ALIGN_RECT} />
					<rect x="6" y="13" width="12" height={RECT_H} {...ALIGN_RECT} />
				</>
			)}
			{name === "align-right" && (
				<>
					<line x1="19" y1="4" x2="19" y2="20" {...ALIGN_LINE} />
					<rect x="12" y="7" width="6" height={RECT_H} {...ALIGN_RECT} />
					<rect x="8" y="13" width="10" height={RECT_H} {...ALIGN_RECT} />
				</>
			)}
			{name === "align-top" && (
				<>
					<line x1="4" y1="5" x2="20" y2="5" {...ALIGN_LINE} />
					<rect
						x="7"
						y="6"
						width={RECT_V_W}
						height={RECT_V_LARGE}
						{...ALIGN_RECT}
					/>
					<rect
						x="13"
						y="6"
						width={RECT_V_W}
						height={RECT_V_SMALL}
						{...ALIGN_RECT}
					/>
				</>
			)}
			{name === "align-center-v" && (
				<>
					<line x1="4" y1="12" x2="20" y2="12" {...ALIGN_LINE} />
					<rect x="7" y="6" width={RECT_V_W} height="12" {...ALIGN_RECT} />
					<rect x="13" y="8" width={RECT_V_W} height="8" {...ALIGN_RECT} />
				</>
			)}
			{name === "align-bottom" && (
				<>
					<line x1="4" y1="19" x2="20" y2="19" {...ALIGN_LINE} />
					<rect x="7" y="8" width={RECT_V_W} height="10" {...ALIGN_RECT} />
					<rect x="13" y="12" width={RECT_V_W} height="6" {...ALIGN_RECT} />
				</>
			)}
			{name === "distribute-left" && (
				<>
					<rect x="8" y="6" width="8" height="4" {...ALIGN_RECT} />
					<rect x="6" y="14" width="12" height="4" {...ALIGN_RECT} />
					<line x1="4" y1="6" x2="20" y2="6" {...ALIGN_LINE} />
					<line x1="4" y1="14" x2="20" y2="14" {...ALIGN_LINE} />
				</>
			)}
			{name === "distribute-center-h" && (
				<>
					<rect x="8" y="6" width="8" height="4" {...ALIGN_RECT} />
					<rect x="6" y="14" width="12" height="4" {...ALIGN_RECT} />
					<line x1="4" y1="8" x2="20" y2="8" {...ALIGN_LINE} />
					<line x1="4" y1="16" x2="20" y2="16" {...ALIGN_LINE} />
				</>
			)}
			{name === "distribute-right" && (
				<>
					<rect x="8" y="6" width="8" height="4" {...ALIGN_RECT} />
					<rect x="6" y="14" width="12" height="4" {...ALIGN_RECT} />
					<line x1="4" y1="10" x2="20" y2="10" {...ALIGN_LINE} />
					<line x1="4" y1="18" x2="20" y2="18" {...ALIGN_LINE} />
				</>
			)}
			{name === "distribute-top" && (
				<>
					<rect x="6" y="6" width="4" height="12" {...ALIGN_RECT} />
					<rect x="14" y="8" width="4" height="8" {...ALIGN_RECT} />
					<line x1="6" y1="4" x2="6" y2="20" {...ALIGN_LINE} />
					<line x1="14" y1="4" x2="14" y2="20" {...ALIGN_LINE} />
				</>
			)}
			{name === "distribute-center-v" && (
				<>
					<rect x="6" y="6" width="4" height="12" {...ALIGN_RECT} />
					<rect x="14" y="8" width="4" height="8" {...ALIGN_RECT} />
					<line x1="8" y1="4" x2="8" y2="20" {...ALIGN_LINE} />
					<line x1="16" y1="4" x2="16" y2="20" {...ALIGN_LINE} />
				</>
			)}
			{name === "distribute-bottom" && (
				<>
					<rect x="6" y="6" width="4" height="12" {...ALIGN_RECT} />
					<rect x="14" y="8" width="4" height="8" {...ALIGN_RECT} />
					<line x1="10" y1="4" x2="10" y2="20" {...ALIGN_LINE} />
					<line x1="18" y1="4" x2="18" y2="20" {...ALIGN_LINE} />
				</>
			)}
			{name === "distribute-spacing-h" && (
				<>
					<line x1="7" y1="9" x2="7" y2="15" {...ALIGN_LINE} />
					<line x1="5.5" y1="10.5" x2="8.5" y2="10.5" {...ALIGN_LINE} />
					<line x1="5.5" y1="13.5" x2="8.5" y2="13.5" {...ALIGN_LINE} />
					<rect x="11" y="6" width="8" height="4" {...ALIGN_RECT} />
					<rect x="12" y="14" width="6" height="4" {...ALIGN_RECT} />
				</>
			)}
			{name === "distribute-spacing-v" && (
				<>
					<line x1="9" y1="7" x2="15" y2="7" {...ALIGN_LINE} />
					<line x1="10.5" y1="5.5" x2="10.5" y2="8.5" {...ALIGN_LINE} />
					<line x1="13.5" y1="5.5" x2="13.5" y2="8.5" {...ALIGN_LINE} />
					<rect x="6" y="11" width="4" height="8" {...ALIGN_RECT} />
					<rect x="14" y="12" width="4" height="6" {...ALIGN_RECT} />
				</>
			)}
			{name === "distribute-h" && (
				<>
					<rect x="5" y="11" width="3" height="7" {...ALIGN_RECT} />
					<rect x="12" y="11" width="3" height="5" {...ALIGN_RECT} />
					<rect x="19" y="11" width="3" height="7" {...ALIGN_RECT} />
					<line x1="5" y1="6" x2="5" y2="10" {...ALIGN_LINE} />
					<line x1="12" y1="6" x2="12" y2="10" {...ALIGN_LINE} />
					<line x1="19" y1="6" x2="19" y2="10" {...ALIGN_LINE} />
				</>
			)}
			{name === "distribute-v" && (
				<>
					<rect x="11" y="5" width="7" height="3" {...ALIGN_RECT} />
					<rect x="11" y="12" width="5" height="3" {...ALIGN_RECT} />
					<rect x="11" y="19" width="7" height="3" {...ALIGN_RECT} />
					<line x1="6" y1="5" x2="10" y2="5" {...ALIGN_LINE} />
					<line x1="6" y1="12" x2="10" y2="12" {...ALIGN_LINE} />
					<line x1="6" y1="19" x2="10" y2="19" {...ALIGN_LINE} />
				</>
			)}
			{name === "align-start" && (
				<>
					<line x1="5" y1="12" x2="19" y2="12" {...ALIGN_LINE} />
					<rect x="6" y="7" width="3" height="10" {...ALIGN_RECT} />
					<rect x="11" y="8" width="3" height="8" {...ALIGN_RECT} />
					<rect x="16" y="6" width="3" height="12" {...ALIGN_RECT} />
					<circle cx="6" cy="12" r="1.5" fill="white" />
				</>
			)}
			{name === "align-end" && (
				<>
					<line x1="5" y1="12" x2="19" y2="12" {...ALIGN_LINE} />
					<rect x="6" y="7" width="3" height="10" {...ALIGN_RECT} />
					<rect x="11" y="8" width="3" height="8" {...ALIGN_RECT} />
					<rect x="16" y="6" width="3" height="12" {...ALIGN_RECT} />
					<circle cx="18" cy="12" r="1.5" fill="white" />
				</>
			)}
			{name === "align-duration" && (
				<>
					<line x1="5" y1="12" x2="19" y2="12" {...ALIGN_LINE} />
					<rect x="6" y="8" width="4" height="8" {...ALIGN_RECT} />
					<rect x="11" y="8" width="4" height="8" {...ALIGN_RECT} />
					<rect x="16" y="8" width="4" height="8" {...ALIGN_RECT} />
				</>
			)}
			{name === "distribute-start" && (
				<>
					<rect x="6" y="8" width="4" height="8" {...ALIGN_RECT} />
					<rect x="11" y="8" width="4" height="8" {...ALIGN_RECT} />
					<rect x="16" y="8" width="4" height="8" {...ALIGN_RECT} />
					<line x1="8" y1="6" x2="8" y2="4" {...ALIGN_LINE} />
					<line x1="13" y1="6" x2="13" y2="4" {...ALIGN_LINE} />
					<line x1="18" y1="6" x2="18" y2="4" {...ALIGN_LINE} />
					<circle cx="8" cy="5" r="1" fill="currentColor" />
					<circle cx="13" cy="5" r="1" fill="currentColor" />
					<circle cx="18" cy="5" r="1" fill="currentColor" />
				</>
			)}
			{name === "distribute-end" && (
				<>
					<rect x="6" y="8" width="4" height="8" {...ALIGN_RECT} />
					<rect x="11" y="8" width="4" height="8" {...ALIGN_RECT} />
					<rect x="16" y="8" width="4" height="8" {...ALIGN_RECT} />
					<line x1="8" y1="16" x2="8" y2="18" {...ALIGN_LINE} />
					<line x1="13" y1="16" x2="13" y2="18" {...ALIGN_LINE} />
					<line x1="18" y1="16" x2="18" y2="18" {...ALIGN_LINE} />
					<circle cx="8" cy="19" r="1" fill="currentColor" />
					<circle cx="13" cy="19" r="1" fill="currentColor" />
					<circle cx="18" cy="19" r="1" fill="currentColor" />
				</>
			)}
		</Svg>
	);
}

export function TargetIcon({
	name,
}: {
	name: "selection" | "comp" | "key-object" | "time";
}): JSX.Element {
	if (name === "selection") {
		return (
			<Svg size={14}>
				<rect
					x="5"
					y="5"
					width="6"
					height="6"
					stroke="currentColor"
					fill="none"
					strokeWidth="1.5"
				/>
				<rect
					x="13"
					y="13"
					width="6"
					height="6"
					stroke="currentColor"
					fill="none"
					strokeWidth="1.5"
				/>
			</Svg>
		);
	}
	if (name === "comp") {
		return (
			<Svg size={14}>
				<rect
					x="2"
					y="2"
					width="20"
					height="20"
					stroke="currentColor"
					fill="none"
					strokeWidth="1.5"
				/>
			</Svg>
		);
	}
	if (name === "time") {
		return (
			<Svg size={14}>
				<circle
					cx="12"
					cy="12"
					r="9"
					stroke="currentColor"
					fill="none"
					strokeWidth="1.5"
				/>
				<path
					d="M12 7v5l3 3"
					stroke="currentColor"
					fill="none"
					strokeWidth="1.2"
				/>
			</Svg>
		);
	}
	return (
		<Svg size={14} fill="currentColor">
			<path d="M7 11V7h4v4H7z" />
			<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
		</Svg>
	);
}
