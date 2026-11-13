import { notificationStore } from "@/management/online/notification/service";

import { type AnchorPosition, buildAnchorScript } from "./script";

type EvalScriptFn = (
	script: string,
	callback?: (result: string) => void,
) => void;

const getEvalScript = (): EvalScriptFn | null => {
	if (typeof window === "undefined") return null;
	const w = window as unknown as {
		__adobe_cep__?: { evalScript?: EvalScriptFn };
		CSInterface?: new () => { evalScript?: EvalScriptFn };
	};
	if (typeof w.__adobe_cep__?.evalScript === "function")
		return w.__adobe_cep__.evalScript;
	try {
		if (w.CSInterface) {
			const cs = new w.CSInterface();
			if (typeof cs.evalScript === "function") return cs.evalScript.bind(cs);
		}
	} catch {
		/* noop */
	}
	return null;
};

const MAX_NOTIFY_DETAIL = 200;

const notifyAnchorOutcome = (raw: string): void => {
	const result = String(raw ?? "").trim();
	if (!result) return;
	if (result === "no comp") {
		notificationStore.add("Ty Plus anchor: no active composition", "warning", {
			duration: 6000,
		});
		return;
	}
	if (result === "no layer") {
		notificationStore.add("Ty Plus anchor: no layer selected", "warning", {
			duration: 6000,
		});
		return;
	}
	if (result.startsWith("err:")) {
		notificationStore.add(
			`Ty Plus anchor failed: ${result.slice(4, 4 + MAX_NOTIFY_DETAIL)}`,
			"error",
			{ duration: 8000 },
		);
		return;
	}
	if (result.startsWith("partial ")) {
		notificationStore.add(
			`Ty Plus anchor completed with errors: ${result.slice(8, 8 + MAX_NOTIFY_DETAIL)}`,
			"warning",
			{ duration: 8000 },
		);
	}
	// "ok ..." results stay silent: success is visible in AE itself.
};

/**
 * Runs the anchor-point ExtendScript and surfaces failures through the
 * non-modal notification store (Issue #72). The script no longer calls
 * ExtendScript `alert()`, which used to block the AE main thread.
 */
export const runAnchorScript = (position: AnchorPosition): void => {
	const ev = getEvalScript();
	if (!ev) return;
	ev(buildAnchorScript(position), (result) => {
		try {
			notifyAnchorOutcome(result);
		} catch {
			// Notification must never break the widget path.
		}
	});
};
