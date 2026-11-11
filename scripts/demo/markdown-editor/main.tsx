import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CepProvider } from "@/management/ae/cep/contexts/Context";
import { MarkdownLiveEditor } from "@/management/preset/markdown/LiveEditor";

const INITIAL = `**Bold** and _italic_ text with \`code\` and [links](https://example.com)

# Heading

A second line with some text.`;

const ReproApp = () => {
	const [value, setValue] = useState(INITIAL);
	return (
		<div
			style={{ maxWidth: 640, margin: "0 auto", padding: 32, color: "#e4e4e7" }}
		>
			<MarkdownLiveEditor
				value={value}
				onChange={setValue}
				placeholder="Description (markdown)"
			/>
		</div>
	);
};

createRoot(document.getElementById("root")!).render(
	<CepProvider
		value={{
			isCep: false,
			hostCode: "",
			panelSurfaceId: "demo",
			extensionId: "",
			openerWorkspacePanelId: "panel-1",
		}}
	>
		<ReproApp />
	</CepProvider>,
);
