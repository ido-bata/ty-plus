import type { CSSProperties, HTMLAttributes, JSX, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useClose } from "@/management/dialog/dialogs/hooks/useClose";
import { useSurface } from "@/management/dialog/dialogs/hooks/useSurface";
import { Content } from "@/management/dialog/dialogs/shell/Content";
import { Footer } from "@/management/dialog/dialogs/shell/Footer";
import { Header } from "@/management/dialog/dialogs/shell/Header";
import { cx } from "@/shared/util/cx";
import { css } from "@/styled-system/css";

/**
 * PandaCSS layout for the dialog shell root. Holds the surface color, drag
 * handlers, and the 100%-height container — the actual 3-area grid is
 * enforced by `dialogColumnBase` on the inner column.
 */
const rootShellBase = css({
	display: "flex",
	flexDirection: "column",
	height: "100%",
	maxHeight: "100%",
	minHeight: "0",
	width: "100%",
	maxWidth: "100%",
	overflow: "hidden",
	boxSizing: "border-box",
	bg: "surface.dialog",
	transitionProperty: "colors",
});

/** Visual feedback when a droppable surface is being dragged over. */
const rootShellDragOver = css({
	boxShadow: "inset 0 0 0 1px var(--ty-interactive-focus)",
	bg: "color-mix(in oklab, var(--ty-interactive-hover) 30%, transparent)",
});

/**
 * Inner content column. CSS Grid enforces the documented 3-area structure:
 *
 *     Header      = auto
 *     Content     = minmax(0, 1fr)
 *     Footer      = auto
 *
 * The grid template is unconditional — callers cannot override the row
 * template via className props. Tailwind utility literals on the active
 * runtime path silently produce zero CSS in the Panda-only bundle, so the
 * shape must be enforced by the shell, not coerced by callers (this is the
 * failure mode that #127 surfaced).
 *
 * Issue #142 follow-up to #127. See `Layout.test.tsx` for the structural
 * invariants that lock this shape against regressions.
 */
const dialogColumnBase = css({
	display: "grid",
	gridTemplateRows: "auto minmax(0, 1fr) auto",
	width: "100%",
	minWidth: "0",
	minHeight: "0",
	flex: "1",
	gap: "var(--ty-shell-space)",
	boxSizing: "border-box",
});

/** Centered small-dialog variant: column caps at the canonical max width. */
const dialogColumnCentered = css({
	maxWidth: "var(--ty-dialog-content-max-width)",
	marginInline: "auto",
});

/** Full-panel variant: column fills the shell width (default). */
const dialogColumnFull = css({
	maxWidth: "100%",
	marginInline: "0",
});

export type DroppedFile = {
	path: string;
	name: string;
	isDirectory: boolean;
};

export type ShellProps = {
	surfaceId?: string;
	title: string;
	/** Replaces the default header (fully custom title row, close button, etc.) */
	header?: ReactNode;
	/** Supplementary text on the right side of the default header (optional. surfaceId is not auto-displayed) */
	headerMeta?: string;
	children: ReactNode;
	footer?: ReactNode;
	footerClassName?: string;
	columnMaxWidth?: string;
	modifier?: string;
	rootClassName?: string;
	contentClassName?: string;
	dialogColumnClassName?: string;
	beforeUnloadGuard?: boolean;
	hasUnsavedChanges?: () => boolean;
	closeConfirmMessage?: string;
	/** Merged onto the default `<DialogHeader>` when `header` is not provided */
	headerChromeProps?: Omit<HTMLAttributes<HTMLElement>, "children">;
	/**
	 * Layout topology:
	 * - `false` (default): full-panel layout — Content fills the entire width.
	 * - `true`: centered small-dialog layout — Content is capped at
	 *   `--ty-dialog-content-max-width` and centered horizontally.
	 *
	 * Both variants share the same 3-area grid (Header=auto,
	 * Content=minmax(0, 1fr), Footer=auto). The grid is enforced by the
	 * shell — callers cannot override the row template via className props.
	 */
	centerContent?: boolean;
	/** Called when files are dropped onto the dialog shell */
	onFileDrop?: (files: DroppedFile[]) => void;
};

export function Shell({
	surfaceId: explicitSurfaceId,
	title,
	header,
	headerMeta,
	children,
	footer,
	footerClassName = "",
	columnMaxWidth,
	modifier = "",
	rootClassName = "",
	contentClassName = "",
	dialogColumnClassName = "",
	beforeUnloadGuard = false,
	hasUnsavedChanges,
	closeConfirmMessage,
	headerChromeProps,
	centerContent = false,
	onFileDrop,
}: ShellProps): JSX.Element {
	const { surfaceId } = useSurface(explicitSurfaceId);
	const { close, onBeforeUnload } = useClose({
		confirmOnClose: Boolean(hasUnsavedChanges),
		confirmMessage: closeConfirmMessage,
		beforeUnloadGuard,
		hasUnsavedChanges,
	});
	const [isDragOver, setIsDragOver] = useState(false);
	const dragCounterRef = useRef(0);
	const onBeforeUnloadRef = useRef(onBeforeUnload);
	useEffect(() => {
		onBeforeUnloadRef.current = onBeforeUnload;
	}, [onBeforeUnload]);

	const handleDragEnter = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (onFileDrop) {
				dragCounterRef.current += 1;
				setIsDragOver(true);
			}
		},
		[onFileDrop],
	);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounterRef.current -= 1;
		if (dragCounterRef.current === 0) {
			setIsDragOver(false);
		}
	}, []);

	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (onFileDrop && e.dataTransfer) {
				e.dataTransfer.dropEffect = "copy";
			}
		},
		[onFileDrop],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (!onFileDrop) return;

			setIsDragOver(false);
			dragCounterRef.current = 0;

			const files: DroppedFile[] = [];

			// Priority 1: dataTransfer.files (Electron/CEP has File.path property)
			if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
				for (let i = 0; i < e.dataTransfer.files.length; i++) {
					const file = e.dataTransfer.files[i];
					const fileWithPath = file as File & { path?: string };
					const filePath = fileWithPath.path;
					files.push({
						path: filePath ?? file.name,
						name: file.name,
						isDirectory: false,
					});
				}
			}
			// Priority 2: dataTransfer.items with webkitGetAsEntry
			else if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
				for (let i = 0; i < e.dataTransfer.items.length; i++) {
					const item = e.dataTransfer.items[i];
					if (item.kind === "file") {
						const entry = item.webkitGetAsEntry?.();
						if (entry) {
							files.push({
								path: entry.name,
								name: entry.name,
								isDirectory: entry.isDirectory,
							});
						} else {
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
			}

			if (files.length > 0) {
				onFileDrop(files);
			}
		},
		[onFileDrop],
	);

	useEffect(() => {
		if (!onFileDrop) return;

		const onWindowDragEnter = (e: DragEvent) => {
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = "copy";
			}
		};

		window.addEventListener("dragenter", onWindowDragEnter);
		return () => {
			window.removeEventListener("dragenter", onWindowDragEnter);
		};
	}, [onFileDrop]);

	useEffect(() => {
		if (!beforeUnloadGuard) {
			return;
		}
		const handler = (event: BeforeUnloadEvent) =>
			onBeforeUnloadRef.current(event);
		window.addEventListener("beforeunload", handler);
		return () => {
			window.removeEventListener("beforeunload", handler);
		};
	}, [beforeUnloadGuard]);

	const rootClasses = cx(
		rootShellBase,
		modifier,
		rootClassName,
		isDragOver ? rootShellDragOver : undefined,
	);

	const columnClasses = cx(
		dialogColumnBase,
		centerContent ? dialogColumnCentered : dialogColumnFull,
		dialogColumnClassName,
	);

	const columnStyle: CSSProperties | undefined = columnMaxWidth
		? { maxWidth: columnMaxWidth }
		: undefined;

	return (
		<dialog
			open
			className={rootClasses}
			aria-modal="false"
			aria-label={title}
			data-surface-id={surfaceId}
			data-dialog-shell=""
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			<div className={columnClasses} style={columnStyle} data-dialog-column="">
				{header ?? (
					<Header
						title={title}
						meta={headerMeta}
						chromeProps={headerChromeProps}
					/>
				)}
				<Content className={contentClassName}>{children}</Content>
				{footer ? <Footer className={footerClassName}>{footer}</Footer> : null}
			</div>
		</dialog>
	);
}
