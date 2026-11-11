import { type JSX, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	createCepSurfaceTransport,
	readCepOpenParams,
} from "@/management/ae/cep/transport";
import { Shell } from "@/management/dialog";
import { readPhysicalExtensionId } from "@/management/dialog/modeless/surface-id";
import { DialogRoot } from "@/management/dialog/Root";
import { isPresetToolDialogSurfaceId } from "@/management/preset/registry";
import { tryConsumePresetToolHandoff } from "@/management/preset/tool-handoff-file";
import { PRESET_TOOL_OPEN_BUS_CHANNEL } from "@/management/preset/tool-open-channel";
import {
	AuthoringField,
	AuthoringGrid,
} from "@/management/preset/tool-shell/archive-layout";
import type { SurfaceMessageEnvelope } from "@/management/workspace/surface/contract";
import { DialogBody } from "@/shared/component/shell/DialogBody";
import { css } from "@/styled-system/css";

const BOOT_SURFACE_ID = "dialog-preset-tool-boot" as const;

const shellContentClass = css({
	display: "flex",
	minHeight: "0",
	flex: "1",
	flexDirection: "column",
	backgroundColor: "surface.dialog",
});

const errorTextClass = css({
	margin: "0",
	fontSize: "shell-text-sm",
	color: "red.400",
});

const bootColumnClass = css({
	display: "flex",
	width: "full",
	minWidth: "0",
	flexDirection: "column",
	gap: "shell",
});

const preparingRowClass = css({
	display: "flex",
	width: "full",
	minWidth: "0",
	alignItems: "center",
	gap: "3",
	borderRadius: "shell-sm",
	borderWidth: "1px",
	borderStyle: "solid",
	borderColor: "border.default",
	backgroundColor: "surface.panel",
	paddingInline: "3",
	paddingBlock: "2",
	fontSize: "shell-text-sm",
	color: "text.muted",
});

const preparingLabelClass = css({
	flexShrink: "0",
});

const progressTrackClass = css({
	position: "relative",
	height: "1",
	minWidth: "0",
	flex: "1",
	overflow: "hidden",
	borderRadius: "full",
	backgroundColor: "surface.widget",
});

const progressBarClass = css({
	position: "absolute",
	top: "0",
	bottom: "0",
	left: "0",
	width: "1/3",
	borderRadius: "full",
	backgroundColor: "text.accent",
	opacity: 0.35,
	animation: "pulse",
});

const placeholderFieldClass = css({
	display: "flex",
	width: "full",
	minWidth: "0",
	flexDirection: "column",
	gap: "1",
});

const placeholderFieldTightClass = css({
	display: "flex",
	width: "full",
	minWidth: "0",
	flexDirection: "column",
	gap: "2",
});

const placeholderLineClass = css({
	display: "block",
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	animation: "pulse",
});

const placeholderLabelClass = css({
	borderRadius: "shell-sm",
	backgroundColor: "surface.widget",
	animation: "pulse",
});

function parsePresetToolSurfaceId(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") {
		return null;
	}
	const raw = (payload as { presetToolSurfaceId?: unknown })
		.presetToolSurfaceId;
	if (typeof raw !== "string") {
		return null;
	}
	const trimmed = raw.trim();
	if (!trimmed || !isPresetToolDialogSurfaceId(trimmed)) {
		return null;
	}
	return trimmed;
}

function tryReadSurfaceFromCepArgs(win: Window): string | null {
	const args = readCepOpenParams<{ presetToolSurfaceId?: unknown }>(win);
	return parsePresetToolSurfaceId(args);
}

/**
 * Modeless host for the CEP preset-add pool. `getArguments` is often
 * empty, and in AE the APPLICATION `dispatchEvent` may not reach a
 * modeless surface, so the handoff file under userData
 * (`writePresetToolHandoff`) is the primary path.
 */
export function ToolHost(): JSX.Element {
	const { t } = useTranslation("presets");
	const [surfaceId, setSurfaceId] = useState<string | null>(null);
	const [bootError, setBootError] = useState<string | null>(null);
	const latestBusHintRef = useRef<SurfaceMessageEnvelope | null>(null);
	const handoffBusyRef = useRef(false);

	useEffect(() => {
		let cancelled = false;
		let pollId: number | null = null;
		const resolvedRef = { current: false };

		const apply = (sid: string): void => {
			if (cancelled || resolvedRef.current) {
				return;
			}
			resolvedRef.current = true;
			if (pollId != null) {
				window.clearInterval(pollId);
				pollId = null;
			}
			setSurfaceId(sid);
		};

		const drainBusHint = (): void => {
			if (cancelled || resolvedRef.current) {
				return;
			}
			const myExt = readPhysicalExtensionId().trim();
			const hint = latestBusHintRef.current;
			if (!myExt || !hint) {
				return;
			}
			const target =
				typeof hint.targetSurfaceId === "string"
					? hint.targetSurfaceId.trim()
					: "";
			if (target && target !== myExt) {
				return;
			}
			const sid = parsePresetToolSurfaceId(hint.payload);
			if (!sid) {
				return;
			}
			latestBusHintRef.current = null;
			apply(sid);
		};

		const tryHandoffFile = (): void => {
			if (cancelled || resolvedRef.current || handoffBusyRef.current) {
				return;
			}
			const myExt = readPhysicalExtensionId().trim();
			if (!myExt) {
				return;
			}
			handoffBusyRef.current = true;
			void tryConsumePresetToolHandoff(window, myExt).then((sid) => {
				handoffBusyRef.current = false;
				if (cancelled || resolvedRef.current || !sid) {
					return;
				}
				apply(sid);
			});
		};

		const tick = (): void => {
			if (cancelled || resolvedRef.current) {
				return;
			}
			const fromArgs = tryReadSurfaceFromCepArgs(window);
			if (fromArgs) {
				apply(fromArgs);
				return;
			}
			drainBusHint();
			tryHandoffFile();
		};

		const fromArgsImmediate = tryReadSurfaceFromCepArgs(window);
		if (fromArgsImmediate) {
			apply(fromArgsImmediate);
			return () => {
				cancelled = true;
			};
		}

		const transport = createCepSurfaceTransport(window);
		const onMessage = (msg: SurfaceMessageEnvelope): void => {
			if (cancelled || resolvedRef.current) {
				return;
			}
			if (
				msg.channel !== PRESET_TOOL_OPEN_BUS_CHANNEL ||
				msg.kind !== "publish"
			) {
				return;
			}
			const myExt = readPhysicalExtensionId().trim();
			const target =
				typeof msg.targetSurfaceId === "string"
					? msg.targetSurfaceId.trim()
					: "";
			if (target && !myExt) {
				latestBusHintRef.current = msg;
				return;
			}
			if (target && myExt && target !== myExt) {
				return;
			}
			const sid = parsePresetToolSurfaceId(msg.payload);
			if (sid) {
				apply(sid);
			}
		};
		const unsubBus = transport.subscribe(onMessage);

		const onWake = (): void => {
			tick();
		};
		window.addEventListener("focus", onWake);
		document.addEventListener("visibilitychange", onWake);

		let ticks = 0;
		const maxTicks = 600;
		pollId = window.setInterval(() => {
			if (cancelled || resolvedRef.current) {
				return;
			}
			ticks += 1;
			tick();
			if (ticks >= maxTicks && !resolvedRef.current) {
				if (pollId != null) {
					window.clearInterval(pollId);
					pollId = null;
				}
				setBootError(t("presetTool.boot.handoffError"));
			}
		}, 32);

		tick();

		return () => {
			cancelled = true;
			unsubBus();
			window.removeEventListener("focus", onWake);
			document.removeEventListener("visibilitychange", onWake);
			if (pollId != null) {
				window.clearInterval(pollId);
			}
		};
	}, [t]);

	if (surfaceId) {
		return <DialogRoot surfaceId={surfaceId} />;
	}

	return (
		<Shell
			title={t("presetTool.boot.title")}
			surfaceId={BOOT_SURFACE_ID}
			contentClassName={shellContentClass}
		>
			<DialogBody>
				{bootError ? (
					<p className={errorTextClass}>{bootError}</p>
				) : (
					<div className={bootColumnClass}>
						<div className={preparingRowClass}>
							<span className={preparingLabelClass}>
								{t("presetTool.boot.preparing")}
							</span>
							<div aria-hidden className={progressTrackClass}>
								<span className={progressBarClass} />
							</div>
						</div>
						<AuthoringGrid>
							<AuthoringField span={3}>
								<div className={placeholderFieldClass}>
									<span
										className={css({
											height: "3",
											width: "20",
											borderRadius: "shell-sm",
											backgroundColor: "surface.widget",
											animation: "pulse",
										})}
									/>
									<span
										className={css({
											display: "block",
											height: "9",
											width: "full",
											borderRadius: "shell-sm",
											backgroundColor: "surface.widget",
											animation: "pulse",
										})}
									/>
								</div>
							</AuthoringField>
							<AuthoringField span={3}>
								<div className={placeholderFieldClass}>
									<span
										className={css({
											height: "3",
											width: "14",
											borderRadius: "shell-sm",
											backgroundColor: "surface.widget",
											animation: "pulse",
										})}
									/>
									<span
										className={css({
											display: "block",
											height: "9",
											width: "full",
											borderRadius: "shell-sm",
											backgroundColor: "surface.widget",
											animation: "pulse",
										})}
									/>
								</div>
							</AuthoringField>
							<AuthoringField span={6}>
								<div className={placeholderFieldClass}>
									<span
										className={css({
											height: "3",
											width: "24",
											borderRadius: "shell-sm",
											backgroundColor: "surface.widget",
											animation: "pulse",
										})}
									/>
									<span
										className={css({
											display: "block",
											height: "9",
											width: "full",
											borderRadius: "shell-sm",
											backgroundColor: "surface.widget",
											animation: "pulse",
										})}
									/>
								</div>
							</AuthoringField>
							<AuthoringField span={3}>
								<div className={placeholderFieldTightClass}>
									<span
										className={css({
											height: "3",
											width: "16",
											borderRadius: "shell-sm",
											backgroundColor: "surface.widget",
											animation: "pulse",
										})}
									/>
									<span
										className={css({
											display: "block",
											height: "32",
											width: "full",
											borderRadius: "shell-sm",
											backgroundColor: "surface.widget",
											animation: "pulse",
										})}
									/>
								</div>
							</AuthoringField>
							<AuthoringField span={3}>
								<div className={placeholderFieldTightClass}>
									<span
										className={css({
											height: "3",
											width: "20",
											borderRadius: "shell-sm",
											backgroundColor: "surface.widget",
											animation: "pulse",
										})}
									/>
									<span
										className={css({
											display: "block",
											height: "32",
											width: "full",
											borderRadius: "shell-sm",
											backgroundColor: "surface.widget",
											animation: "pulse",
										})}
									/>
								</div>
							</AuthoringField>
						</AuthoringGrid>
					</div>
				)}
			</DialogBody>
		</Shell>
	);
}
