import type { Meta, StoryObj } from "@storybook/react";

import {
	FontViewerEmptyState,
	FontViewerErrorBanner,
	FontViewerLoadHint,
	FontViewerLoadPhase,
	FontViewerLocalAccessError,
} from "./FontViewerBanners";
import type { FontLoadVia } from "./use-font-catalog";

type Args = {
	hintLoading: boolean;
	hintVia: FontLoadVia | null;
	hintHasLocalApi: boolean;
	phase: "ae-host" | "browser" | null;
	localError: string;
	loadError: string;
	aeHostError: string;
};

const noop = (): void => undefined;

type WindowWithQueryLocalFonts = Window & {
	queryLocalFonts?: () => Promise<unknown[]>;
};

const stubWindow = (hasLocalApi: boolean): WindowWithQueryLocalFonts => {
	const stub: Record<string, unknown> = {
		queryLocalFonts: hasLocalApi
			? async () => [{ family: "Inter", fullName: "Inter Regular" }]
			: undefined,
	};
	return new Proxy(stub, {
		get: (target, prop) => {
			if (prop in target) return target[prop as string];
			if (typeof prop === "string") return undefined;
			return undefined;
		},
		has: (target, prop) => prop in target,
	}) as unknown as WindowWithQueryLocalFonts;
};

const baseArgs: Args = {
	hintLoading: false,
	hintVia: null,
	hintHasLocalApi: true,
	phase: null,
	localError: "User denied access",
	loadError: "Could not enumerate fonts",
	aeHostError: "After Effects host unreachable",
};

const meta = {
	title: "FontViewer/Banners",
	args: baseArgs,
	argTypes: {
		hintLoading: { control: "boolean" },
		hintVia: {
			control: { type: "select" },
			options: [null, "after-effects", "queryLocalFonts", "documentFonts"],
		},
		hintHasLocalApi: { control: "boolean" },
		phase: {
			control: { type: "inline-radio" },
			options: [null, "ae-host", "browser"],
		},
		localError: { control: "text" },
		loadError: { control: "text" },
		aeHostError: { control: "text" },
	},
	decorators: [
		(Story) => (
			<div style={{ width: 360, padding: 12, display: "grid", gap: 8 }}>
				<Story />
			</div>
		),
	],
	render: (args: Args) => {
		const w = stubWindow(args.hintHasLocalApi);
		// The hint module reads `getQueryLocalFonts()` which inspects the
		// current `window`. Patch it via the storybook iframe window so the
		// `hasLocalApi` arg actually controls the rendered banner.
		if (typeof window !== "undefined") {
			(window as WindowWithQueryLocalFonts).queryLocalFonts = w.queryLocalFonts;
		}
		return (
			<>
				<FontViewerLoadHint
					loading={args.hintLoading}
					via={args.hintVia}
					onLoadAllSystemFonts={noop}
				/>
				<FontViewerLoadPhase loadPhase={args.phase} />
				<FontViewerLocalAccessError error={args.localError} />
				<FontViewerErrorBanner error={args.loadError} />
				<FontViewerEmptyState aeHostError={args.aeHostError} />
			</>
		);
	},
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {
	args: {
		hintVia: "after-effects",
		phase: null,
		localError: "",
		loadError: "",
		aeHostError: "",
	},
};

export const AllBanners: Story = {};
