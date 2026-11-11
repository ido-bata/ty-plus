import { FileSearch } from "lucide-react";
import type { JSX } from "react";
import { selectFile } from "@/management/ae/cep/dialog-shim/bolt";
import type {
	ImageFitValue,
	ImageRepeatValue,
	Layer,
} from "@/management/workspace/background/contract";
import { SegmentedControl } from "@/shared/component/controls/SegmentedControl";
import { PathField } from "@/shared/component/fields/PathField";
import { css } from "@/styled-system/css";
import { QUIET_SELECTED_CLASS } from "./constants";
import { FieldLabel, NumberField } from "./Fields";

const IMAGE_FITS: readonly ImageFitValue[] = [
	"cover",
	"contain",
	"stretch",
	"auto",
];

const IMAGE_REPEATS: readonly ImageRepeatValue[] = [
	"no-repeat",
	"repeat",
	"repeat-x",
	"repeat-y",
];

const root = css({
	display: "grid",
	gap: "2",
});

const fieldGroup = css({
	display: "grid",
	gap: "1",
});

const fileIcon = css({
	height: "4",
	width: "4",
});

const pathFieldOverrides = css({
	"& button": { borderColor: "var(--color-ty-widget-border)" },
	"& input": { borderColor: "var(--color-ty-widget-border)" },
});

const segmentedOverrides = css({
	borderColor: "var(--color-ty-widget-border)",
});

const segmentedButton = css({
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "transparent",
});

const unselected = css({
	backgroundColor: "surface.widget",
	color: "text.muted",
	_hover: {
		backgroundColor: "var(--color-ty-ink-04)",
		color: "text.primary",
	},
});

const isUrlImagePath = (value: string): boolean =>
	/^(https?:|data:image\/)/i.test(value.trim());

export function ImageLayerEditor({
	layer,
	updateLayer,
	t,
}: {
	layer: Layer;
	updateLayer: (id: string, updates: Partial<Layer>) => void;
	t: (key: string) => string;
}): JSX.Element {
	return (
		<div className={root}>
			<div className={fieldGroup}>
				<FieldLabel>{t("workspaceShell.backgroundPanel.imagePath")}</FieldLabel>
				<PathField
					value={layer.imagePath ?? ""}
					onChange={(value) =>
						updateLayer(layer.id, {
							imagePath: value,
							imageSource: isUrlImagePath(value) ? "url" : "file",
						})
					}
					onBrowse={() =>
						selectFile(
							"",
							t("workspaceShell.backgroundPanel.selectImage"),
							(path) => {
								if (!path) return;
								updateLayer(layer.id, {
									imagePath: path,
									imageSource: "file",
								});
							},
						)
					}
					browseAriaLabel={t("workspaceShell.backgroundPanel.browseImage")}
					browseSlot={<FileSearch className={fileIcon} />}
					placeholder={t("workspaceShell.backgroundPanel.imagePathPlaceholder")}
					uiSize="md"
					className={pathFieldOverrides}
				/>
			</div>
			<div className={fieldGroup}>
				<FieldLabel>{t("workspaceShell.backgroundPanel.imageFit")}</FieldLabel>
				<SegmentedControl
					aria-label={t("workspaceShell.backgroundPanel.imageFit")}
					value={layer.imageFit ?? "cover"}
					onChange={(value) =>
						updateLayer(layer.id, { imageFit: value as ImageFitValue })
					}
					options={IMAGE_FITS.map((fit) => ({
						value: fit,
						label: t(`workspaceShell.backgroundPanel.imageFits.${fit}`),
					}))}
					className={segmentedOverrides}
					buttonClassName={segmentedButton}
					selectedClassName={QUIET_SELECTED_CLASS}
					unselectedClassName={unselected}
				/>
			</div>
			<div className={fieldGroup}>
				<FieldLabel>
					{t("workspaceShell.backgroundPanel.imageRepeat")}
				</FieldLabel>
				<SegmentedControl
					aria-label={t("workspaceShell.backgroundPanel.imageRepeat")}
					value={layer.imageRepeat ?? "no-repeat"}
					onChange={(value) =>
						updateLayer(layer.id, {
							imageRepeat: value as ImageRepeatValue,
						})
					}
					options={IMAGE_REPEATS.map((repeat) => ({
						value: repeat,
						label: t(`workspaceShell.backgroundPanel.imageRepeats.${repeat}`),
					}))}
					className={segmentedOverrides}
					buttonClassName={segmentedButton}
					selectedClassName={QUIET_SELECTED_CLASS}
					unselectedClassName={unselected}
				/>
			</div>
			{(layer.imageFit ?? "cover") === "auto" ? (
				<NumberField
					label={t("workspaceShell.backgroundPanel.imageScale")}
					value={layer.imageScale ?? 100}
					min={10}
					max={500}
					onValueChange={(v) => updateLayer(layer.id, { imageScale: v })}
				/>
			) : null}
			<NumberField
				label={t("workspaceShell.backgroundPanel.shiftX")}
				value={layer.imageShiftX ?? 0}
				min={-2000}
				max={2000}
				onValueChange={(v) => updateLayer(layer.id, { imageShiftX: v })}
			/>
			<NumberField
				label={t("workspaceShell.backgroundPanel.shiftY")}
				value={layer.imageShiftY ?? 0}
				min={-2000}
				max={2000}
				onValueChange={(v) => updateLayer(layer.id, { imageShiftY: v })}
			/>
		</div>
	);
}
