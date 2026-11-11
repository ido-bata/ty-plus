import { Grid2X2, Image, Palette } from "lucide-react";
import type { JSX } from "react";
import type { Layer } from "@/management/workspace/background/contract";
import { ImageLayerEditor } from "@/management/workspace/background/ImageLayerEditor";
import {
	clampNumber,
	DEFAULT_COLOR,
	PRESET_COLORS,
} from "@/management/workspace/background/layer-factory";
import { PatternLayerEditor } from "@/management/workspace/background/PatternLayerEditor";
import { Button } from "@/shared/component/controls/Button";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";
import { ColorField, NumberField } from "./Fields";

const layerIconClass = css({
	height: "4",
	width: "4",
	flexShrink: 0,
});

const editorRoot = css({
	display: "grid",
	width: "full",
	gap: "3",
});

const colorEditor = css({
	display: "grid",
	gap: "2",
});

const presetGrid = css({
	display: "grid",
	gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
	gap: "1",
});

const presetSwatch = css({
	aspectRatio: "1 / 1",
	minHeight: "0",
	paddingInline: "0",
	borderColor: "var(--color-ty-widget-border)",
	_hover: { borderColor: "var(--color-ty-widget-border-strong)" },
});

const colorRing = css({
	boxShadow: "0 0 0 1px var(--color-ty-ink-12)",
});

export function LayerIcon({ layer }: { layer: Layer }): JSX.Element {
	if (layer.type === "image") {
		return <Image className={layerIconClass} />;
	}
	if (layer.type === "pattern") {
		return <Grid2X2 className={layerIconClass} />;
	}
	return <Palette className={layerIconClass} />;
}

export function LayerEditor(props: {
	layer: Layer;
	updateLayer: (id: string, updates: Partial<Layer>) => void;
	t: (key: string) => string;
}): JSX.Element {
	const { layer, updateLayer, t } = props;
	const updateNumber = (key: keyof Layer, min: number, max: number) => {
		return (value: number) => {
			updateLayer(layer.id, {
				[key]: clampNumber(value, min, max),
			});
		};
	};

	return (
		<div className={editorRoot}>
			<NumberField
				label={t("workspaceShell.backgroundPanel.opacity")}
				value={layer.opacity}
				min={0}
				max={100}
				onValueChange={updateNumber("opacity", 0, 100)}
			/>

			{layer.type === "color" ? (
				<div className={colorEditor}>
					<ColorField
						label={t("workspaceShell.backgroundPanel.color")}
						value={layer.color ?? DEFAULT_COLOR}
						onColorChange={(value) => updateLayer(layer.id, { color: value })}
					/>
					<div className={presetGrid}>
						{PRESET_COLORS.map((color) => (
							<Button
								key={color}
								type="button"
								variant="default"
								uiSize="sm"
								fullWidth
								className={cx(
									presetSwatch,
									layer.color === color ? colorRing : "",
								)}
								style={{ backgroundColor: color }}
								title={color}
								onClick={() => updateLayer(layer.id, { color })}
							/>
						))}
					</div>
				</div>
			) : null}

			{layer.type === "image" ? (
				<ImageLayerEditor layer={layer} updateLayer={updateLayer} t={t} />
			) : null}

			{layer.type === "pattern" ? (
				<PatternLayerEditor layer={layer} updateLayer={updateLayer} t={t} />
			) : null}
		</div>
	);
}
