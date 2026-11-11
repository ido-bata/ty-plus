import { Folder, Home as HomeIcon, Settings } from "lucide-react";
import type { JSX } from "react";
import { Button } from "@/shared/component/controls/Button";
import { IconButton } from "@/shared/component/controls/IconButton";
import { css } from "@/styled-system/css";
import { PreviewGroup } from "./ComponentPreviewSection";

const buttonsGridStyle = css({
	display: "grid",
	gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
	gap: "2",
	sm: {
		gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
	},
	lg: {
		gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
	},
});

const iconButtonsGridStyle = css({
	display: "grid",
	gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
	gap: "2",
	sm: {
		gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
	},
});

const homeStyle = css({
	width: "3.5",
	height: "3.5",
});

export function ButtonsPreview(): JSX.Element {
	return (
		<>
			<PreviewGroup title="Buttons">
				<div className={buttonsGridStyle}>
					<Button variant="default" uiSize="sm">
						Default
					</Button>
					<Button variant="secondary" uiSize="sm">
						Secondary
					</Button>
					<Button variant="primary" uiSize="sm">
						Primary
					</Button>
					<Button variant="outline" uiSize="sm">
						Outline
					</Button>
					<Button variant="ghost" uiSize="sm">
						Ghost
					</Button>
					<Button variant="danger" uiSize="sm">
						Danger
					</Button>
					<Button variant="primary" uiSize="sm" start={<HomeIcon size={14} />}>
						With Icon
					</Button>
				</div>
				<div className={buttonsGridStyle}>
					<Button variant="default" uiSize="md">
						Medium
					</Button>
					<Button variant="primary" uiSize="lg">
						Large
					</Button>
					<Button variant="default" uiSize="sm" disabled>
						Disabled
					</Button>
				</div>
			</PreviewGroup>
			<PreviewGroup title="Icon Buttons">
				<div className={iconButtonsGridStyle}>
					<IconButton variant="ghost" size="sm">
						<HomeIcon size={14} />
					</IconButton>
					<IconButton variant="ghost" size="md">
						<Folder size={16} />
					</IconButton>
					<IconButton variant="ghost" size="lg">
						<Settings size={18} />
					</IconButton>
					<IconButton variant="default" size="sm">
						<HomeIcon size={14} />
					</IconButton>
					<IconButton variant="default" size="md">
						<Folder size={16} />
					</IconButton>
					<IconButton variant="default" size="lg">
						<Settings size={18} />
					</IconButton>
				</div>
			</PreviewGroup>
		</>
	);
}
