import {
	type GatewayBootFailureReason,
	labelOfGatewayBootFailureReason,
} from "@/management/panel/cloud-gateway-boot";

/**
 * How the catalog empty state's retry affordance should behave.
 */
export interface GatewayRetryAffordance {
	readonly title: string;
	readonly disabled: boolean;
}

/**
 * The refresh button in the disconnected empty state runs `loadCatalog()`,
 * which is `searchCatalog` and nothing more. It cannot rebuild the cloud
 * gateway — `tryBuildCloudGateway` is reached only from panel boot, so there
 * is no reconnect path a dialog could call.
 *
 * So the label has to describe what the click actually does. When the gateway
 * boot failed, retrying the catalog query cannot recover: the reason is
 * reported and the control is disabled rather than inviting a click that
 * silently does nothing useful. When the gateway is healthy and only the
 * query failed, it is a genuine catalog refresh.
 *
 * A `reasonTag` is present only for the `degraded` health state, which is
 * exactly the boot-failed case.
 */
export function gatewayRetryAffordance(
	reasonTag: GatewayBootFailureReason | undefined,
): GatewayRetryAffordance {
	if (!reasonTag) {
		return { title: "Refresh catalog", disabled: false };
	}
	return {
		title: `${labelOfGatewayBootFailureReason(reasonTag)} — reload the panel to retry the gateway boot`,
		disabled: true,
	};
}
