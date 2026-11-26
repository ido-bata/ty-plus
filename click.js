() => {
	const button = document.querySelector('[data-ws-action="loop-preview-toggle"]');
	if (!button) return "no button";
	button.click();
	return "clicked";
}
