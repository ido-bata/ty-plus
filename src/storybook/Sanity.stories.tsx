/**
 * Sanity story that exists purely to validate the decorator chain.
 * If the Storybook preview boots and renders this story, every
 * decorator in `src/storybook/decorators/index.ts` has resolved
 * its imports and the PanelRoot provider nest order is consistent.
 *
 * Delete this file once Wave 2 introduces real component stories.
 */

import type { Meta, StoryObj } from "@storybook/react";
import { useTranslation } from "react-i18next";

import { useCep } from "@/management/ae/cep/contexts/Context";
import { useAfterEffectsFilesGateway } from "@/management/ae/files/gateway-context";

function SanityPanel() {
	const cep = useCep();
	const filesGateway = useAfterEffectsFilesGateway();
	const { t } = useTranslation("common");

	return (
		<div
			style={{
				padding: 16,
				color: "#fff",
				fontFamily: "sans-serif",
				display: "grid",
				gap: 8,
			}}
			data-sanity-story
		>
			<h1 style={{ fontSize: 14, fontWeight: 600 }}>
				{t("appName", { defaultValue: "Storybook decorator sanity check" })}
			</h1>
			<dl style={{ fontSize: 11, lineHeight: 1.4, opacity: 0.85 }}>
				<dt>isCep</dt>
				<dd data-sanity="is-cep">{String(cep.isCep)}</dd>
				<dt>hostCode</dt>
				<dd data-sanity="host-code">{cep.hostCode}</dd>
				<dt>panelSurfaceId</dt>
				<dd data-sanity="panel-surface-id">{cep.panelSurfaceId}</dd>
				<dt>filesGateway</dt>
				<dd data-sanity="files-gateway">{filesGateway ? "present" : "null"}</dd>
				<dt>i18n.language</dt>
				<dd data-sanity="i18n-language">{t("language")}</dd>
			</dl>
		</div>
	);
}

const meta = {
	title: "Sanity/DecoratorChain",
	component: SanityPanel,
} satisfies Meta<typeof SanityPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
