interface Window {
	__STORYBOOK_PREVIEW__?: {
		currentRender?: {
			phase?: string;
			canvasElement?: HTMLElement;
			renderToScreen?: (args: unknown, el: HTMLElement) => Promise<unknown>;
		};
	};
}
