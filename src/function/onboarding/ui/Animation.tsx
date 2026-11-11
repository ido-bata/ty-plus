import { type JSX, useEffect, useRef } from "react";
import { css } from "@/styled-system/css";

type AnimationProps = {
	variant?: "intro" | "workspace";
};

const prefersReducedMotion = (): boolean =>
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Animation({ variant = "intro" }: AnimationProps): JSX.Element {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		if (prefersReducedMotion()) {
			return;
		}
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}

		let frame = 0;
		let raf = 0;
		const dpr = Math.max(1, window.devicePixelRatio || 1);

		const draw = () => {
			const { width: cssW, height: cssH } = canvas.getBoundingClientRect();
			const w = Math.max(1, Math.floor(cssW * dpr));
			const h = Math.max(1, Math.floor(cssH * dpr));
			if (canvas.width !== w || canvas.height !== h) {
				canvas.width = w;
				canvas.height = h;
			}
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, cssW, cssH);

			const root = getComputedStyle(document.documentElement);
			const accent =
				root.getPropertyValue("--color-ty-accent").trim() ||
				"var(--color-ty-accent, #b0b0b0)";
			const muted =
				root.getPropertyValue("--color-ty-text-secondary").trim() ||
				"var(--color-ty-text-secondary, #a0a0b6)";

			const cell = Math.max(20, Math.floor(cssH * 0.42));
			const gap = Math.max(6, Math.floor(cell * 0.12));
			const offset = (frame * 0.45) % (cell + gap);
			const rows = 2;
			const cols = Math.ceil(cssW / (cell + gap)) + 2;

			for (let y = 0; y < rows; y += 1) {
				for (let x = 0; x < cols; x += 1) {
					const px = x * (cell + gap) - offset;
					const py = y * (cell + gap) + 6;
					ctx.globalAlpha = variant === "workspace" ? 0.2 : 0.14;
					ctx.fillStyle = x % 2 === 0 ? accent : muted;
					ctx.fillRect(px, py, cell, cell);
				}
			}
			ctx.globalAlpha = 1;

			frame += 1;
			raf = window.requestAnimationFrame(draw);
		};

		raf = window.requestAnimationFrame(draw);
		return () => {
			window.cancelAnimationFrame(raf);
		};
	}, [variant]);

	const canvasClass = css({
		display: "block",
		width: "full",
		height: "full",
		borderRadius: "shell-sm",
		backgroundColor:
			"color-mix(in srgb, var(--color-surface-widget), 84%, transparent)",
	});

	return (
		<canvas
			ref={canvasRef}
			className={canvasClass}
			data-testid="onboarding-animation-canvas"
		/>
	);
}
