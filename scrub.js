() => {
	const canvas = document.querySelector("[data-ws-loop-wave-canvas]");
	if (!canvas) return "no canvas";
	const rect = canvas.getBoundingClientRect();
	const x = rect.left + rect.width * 0.62;
	const y = rect.top + rect.height * 0.8;
	const opts = { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0 };
	canvas.dispatchEvent(new PointerEvent("pointerdown", opts));
	canvas.dispatchEvent(new PointerEvent("pointermove", opts));
	canvas.dispatchEvent(new PointerEvent("pointerup", opts));
	return "scrubbed";
}
