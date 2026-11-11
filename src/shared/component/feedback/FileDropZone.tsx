import { Upload } from "lucide-react";
import { type JSX, useCallback, useRef, useState } from "react";
import { Icon } from "@/shared/component";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

export type DroppedFile = {
	path: string;
	name: string;
	isDirectory: boolean;
};

type DropZoneProps = {
	onFilesDropped: (files: DroppedFile[]) => void;
	disabled?: boolean;
	className?: string;
};

const dropZoneDefault = css({
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	gap: "2",
	borderRadius: "shell-sm",
	borderWidth: "2px",
	borderStyle: "dashed",
	borderColor: "border.subtle",
	backgroundColor: "surface.widget",
	opacity: 0.3,
	paddingInline: "4",
	paddingBlock: "6",
	color: "text.muted",
	transitionProperty: "colors",
	transitionDuration: "fast",
	cursor: "default",
});

const dropZoneHover = css({
	borderStyle: "solid",
	borderColor: "interactive.focus",
	backgroundColor: "surface.widget",
	opacity: 0.6,
	color: "text.primary",
});

const dropZoneDisabled = css({
	opacity: 0.5,
	cursor: "not-allowed",
});

const label = css({
	fontSize: "shell-text-sm",
	userSelect: "none",
});

export function FileDropZone(props: DropZoneProps): JSX.Element {
	const { onFilesDropped, disabled, className } = props;
	const [isDragOver, setIsDragOver] = useState(false);
	const dragCounterRef = useRef(0);

	const handleDragEnter = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (disabled) return;
			dragCounterRef.current += 1;
			setIsDragOver(true);
		},
		[disabled],
	);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounterRef.current -= 1;
		if (dragCounterRef.current === 0) {
			setIsDragOver(false);
		}
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (disabled) return;

			setIsDragOver(false);
			dragCounterRef.current = 0;

			const items = e.dataTransfer.items;
			if (!items || items.length === 0) return;

			const files: DroppedFile[] = [];

			// Process all dropped items
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (item.kind === "file") {
					// Try FileSystemEntry first (better path info)
					const entry = item.webkitGetAsEntry?.();
					if (entry) {
						// In CEP environments, we use the name and rely on the full path
						// being reconstructed from the drop data
						const fileName = entry.name;
						// For FileSystemFileEntry, try to get the fullPath
						const fullPath =
							entry.fullPath && entry.fullPath !== fileName
								? entry.fullPath
								: fileName;

						files.push({
							path: fullPath,
							name: fileName,
							isDirectory: entry.isDirectory,
						});
					} else {
						// Fallback: use File object with path property (CEP/Electron)
						const file = item.getAsFile();
						if (file) {
							const fileWithPath = file as File & { path?: string };
							files.push({
								path: fileWithPath.path ?? file.name,
								name: file.name,
								isDirectory: false,
							});
						}
					}
				}
			}

			if (files.length > 0) {
				onFilesDropped(files);
			}
		},
		[disabled, onFilesDropped],
	);

	return (
		<div
			className={cx(
				dropZoneDefault,
				isDragOver && !disabled ? dropZoneHover : "",
				disabled ? dropZoneDisabled : "",
				className,
			)}
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			<Icon icon={Upload} size={20} aria-hidden />
			<span className={label}>Drag &amp; drop file here</span>
		</div>
	);
}
