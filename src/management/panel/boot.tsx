/**
 * Panel boot logic - handles panel-specific concerns:
 * - Primary panel detection
 * - Onboarding state
 * - Theme and appearance bootstrap
 */

import { type JSX, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { SetupRequired } from "@/function/onboarding/ui/SetupRequired";
import { View as OnboardingView } from "@/function/onboarding/View";
import { resolvePanelSurfaceIdForBoot } from "@/management/ae/cep/entry/id";
import { PanelRoot } from "@/management/ae/cep/entry/PanelRoot";
import { probeAfterEffectsEvalScript } from "@/management/ae/cep/host-executor";
import { detectCepHostCode } from "@/management/ae/cep/runtime";
import {
	createCepSurfaceTransport,
	tyPlusWorkspaceExtensionId,
} from "@/management/ae/cep/transport";
import {
	enableCepBroadcast,
	enableInterceptor,
	flushOnAEPanelClose,
	initializeLogRetention,
} from "@/management/debug/console/interceptor";
import { createLogger } from "@/management/debug/logger";
import { installCepJsonContextMenuRewrite } from "@/management/dialog/dialogs/context-menu";
import { initializeI18n } from "@/management/i18n";
import { NotificationContainer } from "@/management/online/notification/Container";
import { readBootProbeFlag } from "@/management/panel/boot-feature-flags";
import {
	type BootWorkloadBudget,
	createBootWorkloadBudget,
	runUnderBootWorkloadBudget,
} from "@/management/panel/boot-workload-budget";
import {
	isDegradedGatewayBootResult,
	labelOfGatewayBootFailureReason,
	tryBuildCloudGateway,
} from "@/management/panel/cloud-gateway-boot";
import { bootstrapCepShellThemeHydration } from "@/management/panel/inject-styles";
import { Main } from "@/management/panel/Main";
import { tryBuildThumbnailGateway } from "@/management/panel/thumbnail-gateway-boot";
import {
	isInitializationComplete,
	readInitializationStateFromApp,
} from "@/management/setting/onboarding/initialization";
import { requestLayoutReload } from "@/management/workspace/onboarding/layout-reload-bridge";
import {
	type OnboardingPayload,
	SHELL_CHANNELS,
} from "@/management/workspace/surface/contract";
import { css } from "@/styled-system/css";

const bootLog = createLogger("boot");

const panelAppRoot = css({
	display: "flex",
	height: "full",
	minHeight: "0",
	minWidth: "0",
	flex: "1",
	flexDirection: "column",
	overflow: "hidden",
});

type PanelAppProps = {
	initialShowOnboarding: boolean;
	isPrimaryPanel: boolean;
	initCompleted: boolean;
	panelSurfaceId: string;
};

const POLL_INITIAL_STATE_MS = 2_000;
const POLL_INITIAL_STATE_INTERVAL_MS = 2_000;

async function checkInitCompletedFromState(win: Window): Promise<boolean> {
	const state = await readInitializationStateFromApp(win);
	return state != null && isInitializationComplete(state).completed;
}

function PanelApp({
	initialShowOnboarding,
	isPrimaryPanel,
	initCompleted,
	panelSurfaceId,
}: PanelAppProps): JSX.Element {
	const [showOnboarding, setShowOnboarding] = useState(initialShowOnboarding);
	const [hasInitCompleted, setHasInitCompleted] = useState(initCompleted);
	const cepSurfaceTransport = useMemo(
		() => createCepSurfaceTransport(window),
		[],
	);

	// Auxiliary panels: drop SetupRequired once the primary panel finishes onboarding.
	// The primary panel drives its own `showOnboarding` state via the OnboardingView callback.
	useEffect(() => {
		if (isPrimaryPanel) {
			return;
		}
		const markCompleted = (source: string): void => {
			bootLog.info("[ty-plus] onboarding completion received", {
				context: { panelSurfaceId, source },
			});
			setHasInitCompleted(true);
		};
		const unsubscribe = cepSurfaceTransport.subscribe((msg) => {
			if (msg.channel !== SHELL_CHANNELS.onboarding) return;
			if (msg.kind !== "publish") return;
			const p = msg.payload;
			if (!p || typeof p !== "object") return;
			const pl = p as OnboardingPayload;
			if (pl.kind !== "completed") return;
			if (typeof pl.sourceSurfaceId !== "string") return;
			if (typeof pl.at !== "string") return;
			if (
				typeof msg.sourceSurfaceId === "string" &&
				msg.sourceSurfaceId === panelSurfaceId
			) {
				return;
			}
			markCompleted("bus");
		});
		// Fallback: poll ty-plus-init.json so auxiliary panels drop SetupRequired
		// even if the cross-panel CEP event is not delivered (stale bundle, missed
		// scope, etc.). Bus event above still wins the moment it fires; this is the
		// safety net so the panel never gets stuck on SetupRequired.
		let stopped = false;
		const check = async (): Promise<void> => {
			if (stopped) return;
			let initCompleted = false;
			try {
				initCompleted = await checkInitCompletedFromState(window);
			} catch {
				/* ignore - file may not be readable yet */
			}
			if (stopped) return;
			if (initCompleted) {
				markCompleted("poll");
				return;
			}
			globalThis.setTimeout(check, POLL_INITIAL_STATE_INTERVAL_MS);
		};
		globalThis.setTimeout(check, POLL_INITIAL_STATE_MS);
		return () => {
			stopped = true;
			unsubscribe();
		};
	}, [isPrimaryPanel, panelSurfaceId, cepSurfaceTransport]);

	return (
		<div className={panelAppRoot}>
			{!hasInitCompleted && !isPrimaryPanel ? (
				<SetupRequired />
			) : (
				<>
					<Main />
					<NotificationContainer />
					{showOnboarding && isPrimaryPanel ? (
						<OnboardingView
							onCompleted={(detail: { layoutReadSupportRoot: string }) => {
								requestLayoutReload({
									layoutReadSupportRoot: detail.layoutReadSupportRoot,
								});
								setShowOnboarding(false);
							}}
						/>
					) : null}
				</>
			)}
		</div>
	);
}

export async function bootPanel(): Promise<void> {
	// Issue #129: the first thing the panel boot does is emit a boot event.
	// The bus is module-level so any `createLogger` reachable from a
	// downstream call can already see this entry; subscribers attached via
	// `enableInterceptor` later (e.g. from inside this function below) get
	// the buffer replay on subscribe and surface it to the Debug Console.
	bootLog.info("[ty-plus] panel boot started", {
		context: { isCep: typeof window !== "undefined" },
	});

	// Issue #131: per-workload 5-second soft budget. Each background
	// workload (cloud gateway, thumbnail gateway, i18n, log retention)
	// emits a start/finish pair with elapsed ms. Any workload that runs
	// longer than 5s logs a warn, but the workloads themselves are NOT
	// cancelled by the budget — owning code decides its own lifecycle.
	// `boot-workload-budget.ts` documents the full invariant.
	//
	// Boot-time connectivity / catalog probes and the startup preset
	// asset scan were removed in #131 hardening; the boot is intentionally
	// minimal-side-effect.
	const bootBudget: BootWorkloadBudget = createBootWorkloadBudget({
		budgetMs: 5_000,
	});

	const mount = document.getElementById("app");
	if (!mount) {
		bootLog.error("[ty-plus] panel boot aborted: missing #app mount point");
		throw new Error("Missing #app mount point");
	}

	const panelSurfaceId = await resolvePanelSurfaceIdForBoot();
	bootLog.info("[ty-plus] panel surface resolved", {
		context: { panelSurfaceId },
	});
	const panelMatch = /^panel-(\d+)$/.exec(panelSurfaceId);
	const panelIndex = panelMatch ? Number(panelMatch[1]) : 1;

	const isPrimaryPanel = panelSurfaceId === "panel-1";

	// ty-plus-init.json lives in the host application folder only.
	let initCompleted = false;
	const initState = await readInitializationStateFromApp(window);
	const { completed } = isInitializationComplete(initState);
	initCompleted = completed;

	const showOnboarding = isPrimaryPanel && !initCompleted;

	const isCep =
		typeof (window as unknown as { __adobe_cep__?: unknown }).__adobe_cep__ !==
			"undefined" ||
		typeof (window as unknown as { CSInterface?: unknown }).CSInterface !==
			"undefined";

	// Initialize appearance and transport AFTER checking onboarding state.
	// This prevents file creation (via useWorkspaceRuntime) before onboarding completes.
	bootstrapCepShellThemeHydration(window);
	enableInterceptor();
	enableCepBroadcast(window);
	// Issue #79: capture AE shutdown / panel-reload flush for the workspace
	// panel. The hook is idempotent; `useWorkspaceRuntime` (which also calls
	// `enableInterceptor`) is a separate mount-once effect inside the React
	// tree and is not a second install.
	flushOnAEPanelClose(window);

	// Issue #131: log retention is a fire-and-forget host round-trip.
	// Track its lifecycle under the budget so we can correlate long
	// boot stalls against it without a separate diagnostic path.
	const logRetentionHandle = bootBudget.start("debug-log-retention");
	void initializeLogRetention(window)
		.then(() => {
			logRetentionHandle.finish("completed");
		})
		.catch((err) => {
			logRetentionHandle.finish("failed");
			bootLog.warn("[ty-plus] Debug log retention initialization failed", {
				context: { error: String(err) },
			});
		});

	await runUnderBootWorkloadBudget(bootBudget, "i18n-init", () =>
		initializeI18n(window),
	);

	// Install CEP context menu rewrite globally so all components can register
	// their own surface-specific handlers. This must be done before rendering.
	installCepJsonContextMenuRewrite(window, panelSurfaceId);

	const thumbnailHandle = bootBudget.start("thumbnail-gateway-boot");
	const thumbnailGateway = tryBuildThumbnailGateway(window);
	thumbnailHandle.finish("completed");
	const cloudHandle = bootBudget.start("cloud-gateway-boot");
	const cloudGatewayBootResult = tryBuildCloudGateway(window);
	cloudHandle.finish(
		isDegradedGatewayBootResult(cloudGatewayBootResult)
			? "failed"
			: "completed",
	);
	if (isDegradedGatewayBootResult(cloudGatewayBootResult)) {
		// Issue #129: route the degraded boot failure into the canonical
		// bus with the `online-runtime` source so the Debug Console sees it
		// instead of only catching it via the legacy `console.error` line
		// below (which would land in the bus with the `console-interceptor`
		// source). The `console.error` line is retained for AE DevTools
		// visibility.
		bootLog.error("[ty-plus] panel boot: live cloud gateway not built", {
			context: {
				reason: cloudGatewayBootResult.failure.reason,
				label: labelOfGatewayBootFailureReason(
					cloudGatewayBootResult.failure.reason,
				),
				message: cloudGatewayBootResult.failure.message,
			},
		});
		console.error(
			`[ty-plus] panel boot: live cloud gateway not built (${labelOfGatewayBootFailureReason(cloudGatewayBootResult.failure.reason)})`,
			cloudGatewayBootResult.failure,
		);
	}

	// Issue #131 (hardening): the boot does NOT run a startup preset
	// asset scan. `runStartupPresetAssetScan` was used to enumerate
	// the catalog and call `verifyPresetAsset` per record at boot.
	// Cancellation via `Promise.race(timeout)` was NOT real cancellation
	// — the ExtendScript evalScript kept running on the AE host. With
	// a hung host call, outstanding evalScript count grew unbounded
	// over time even with `concurrency: 1`. The release never fans
	// out over the catalog at boot; stale detection happens lazily on
	// execute (`verifySinglePresetAsset`) and via explicit refresh.
	//
	// The cloud-gateway boot probes are also OFF in the release default
	// (see `boot-feature-flags.ts`). Operators can opt in via
	// `TY_PLUS_BOOT_PROBES=on` for diagnostics.
	bootLog.info(
		"[ty-plus] panel boot: lazy verification only (no boot-time host scan, no auto probes)",
		{
			context: {
				bootProbeFlag: readBootProbeFlag(),
				bootedAt: Date.now(),
			},
		},
	);

	// Issue #138: ExtendScript `probeAfterEffectsEvalScript` is opt-in only.
	// Releasing the result is gated on `TY_PLUS_BOOT_PROBES=on` so the
	// default release build does not pollute the diagnostic log with a
	// synthetic probe result. The probe runs under the boot workload
	// budget so a slow ExtendScript hand-off is correlated with the same
	// budget that gates the other boot workloads.
	if (readBootProbeFlag() === "on") {
		const probeHandle = bootBudget.start("extend-script-probe");
		void probeAfterEffectsEvalScript(window)
			.then((result) => {
				bootLog.info("[ty-plus] ExtendScript probe OK", {
					context: { result },
				});
				probeHandle.finish("completed");
			})
			.catch((err) => {
				bootLog.warn("[ty-plus] ExtendScript probe failed", {
					context: {
						error: err instanceof Error ? err.message : String(err),
					},
				});
				probeHandle.finish("failed");
			});
	}

	// Issue #131: settle any still-running boot workloads on panel
	// unload. The host flushes the workspace when the panel closes;
	// signals are observed via `flushOnAEPanelClose` above. We add
	// `pagehide` and `beforeunload` so a window navigation also
	// tears the budget down before the React tree is unmounted.
	//
	// `flushOnAEPanelClose` (installed above) and the
	// `pagehide`/`beforeunload` window listeners can both fire on AE
	// panel close, so without a guard the teardown body would run
	// twice and emit two `boot.workload.report` entries into the
	// Debug Console. `torn` short-circuits the second invocation.
	//
	// `bootBudget.report()` already classifies unfinished records as
	// `aborted` (see `boot-workload-budget.ts:226`), so the previous
	// `finishAll("aborted")` call was redundant.
	let torn = false;
	const teardown = (reason: string): void => {
		if (torn) return;
		torn = true;
		bootBudget.report();
		bootLog.info("[ty-plus] panel boot teardown", {
			context: { reason, panelSurfaceId },
		});
	};
	if (typeof window !== "undefined") {
		window.addEventListener("pagehide", () => teardown("pagehide"), {
			once: true,
		});
		window.addEventListener("beforeunload", () => teardown("beforeunload"), {
			once: true,
		});
	}

	createRoot(mount).render(
		<PanelRoot
			value={{
				isCep,
				hostCode: detectCepHostCode(),
				panelSurfaceId,
				extensionId: tyPlusWorkspaceExtensionId(panelIndex),
				openerWorkspacePanelId: panelSurfaceId,
			}}
			gateway={thumbnailGateway}
		>
			<PanelApp
				initialShowOnboarding={Boolean(showOnboarding)}
				isPrimaryPanel={isPrimaryPanel}
				initCompleted={initCompleted}
				panelSurfaceId={panelSurfaceId}
			/>
		</PanelRoot>,
	);

	bootLog.info("[ty-plus] panel boot initialized", {
		context: {
			panelSurfaceId,
			isPrimaryPanel,
			gateway: isDegradedGatewayBootResult(cloudGatewayBootResult)
				? "degraded"
				: "live",
		},
	});
}
