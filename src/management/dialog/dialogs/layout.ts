type Size = { width: number; height: number };

/**
 * For CEP **Modeless extension windows** (manifest dialogs / other panels).
 * Workaround for cases where the containing block height stays at 0 on the first frame,
 * causing `height:100%` to collapse.
 * Add `ty-plus-cep-shell` class only. Let the manifest `<Geometry>` control initial size.
 * Only use resizeContent as a fallback when dimensions are genuinely 0.
 */
export function applyCepModelessShellLayoutGuards(win: Window): void {
	win.document.documentElement.classList.add("ty-plus-cep-shell");

	const CS = (
		win as unknown as {
			CSInterface?: new () => {
				resizeContent?: (w: number, h: number) => void;
			};
		}
	).CSInterface;

	const resizeOnce = (): void => {
		if (!CS) return;
		const iw = win.innerWidth;
		const ih = win.innerHeight;
		if (iw < 2 || ih < 2) return;
		try {
			const cs = new CS();
			cs.resizeContent?.(iw, ih);
		} catch {
			/* host may throw if not ready */
		}
	};

	const iw = win.innerWidth;
	const ih = win.innerHeight;
	if (iw > 0 && ih > 0) return;

	// Fallback only when dimensions are genuinely 0
	const scheduleMs = [32, 100, 220, 450] as const;
	for (const ms of scheduleMs) {
		win.setTimeout(resizeOnce, ms);
	}
}
