import { Button, Icon, listItemTitleClass } from "@ty-plus/ui";
import { FilterX, RefreshCw } from "lucide-react";
import type { JSX } from "react";
import { i18n } from "@/management/i18n/index";
import { gatewayRetryAffordance } from "@/management/online/catalog/gateway-retry";
import type { GatewayBootFailureReason } from "@/management/panel/cloud-gateway-boot";
import { css } from "@/styled-system/css";

/**
 * Props for the preset-library empty-state card.
 *
 * Issue #128 surfaces the classified boot failure as a second line of copy
 * (`disconnectedReason`) and a machine-readable attribute
 * (`data-gateway-boot-reason={disconnectedReasonTag}`) so:
 *
 *   - `data-online-preset-empty` regression tests can branch on it
 *   - retained logs can join the UI to the classified reason
 *   - the user can read a concrete failure message instead of the silent
 *     "No online catalog." copy
 */
export type PresetLibraryEmptyStateProps = {
	loading: boolean;
	catalogLength: number;
	filteredLength: number;
	onRefresh: () => void;
	onClearFilters: () => void;
	disconnected?: boolean;
	disconnectedReason?: string;
	disconnectedReasonTag?: GatewayBootFailureReason;
};

const emptyClass = css({
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	flex: "1",
	padding: "8",
	gap: "3",
});

const emptyTextClass = css({
	fontSize: "sm",
	color: "text.muted",
});

const disconnectedReasonClass = css({
	fontSize: "xs",
	color: "text.muted",
});

export function PresetLibraryEmptyState(
	props: PresetLibraryEmptyStateProps,
): JSX.Element | null {
	const {
		loading,
		catalogLength,
		filteredLength,
		onRefresh,
		onClearFilters,
		disconnected,
		disconnectedReason,
		disconnectedReasonTag,
	} = props;
	if (loading) {
		// jobs6 (#792): a bare `null` left the panel completely blank during
		// the catalog fetch. Show a muted loading label — deliberately
		// without the `data-online-preset-empty` marker, since this is not
		// an empty state.
		return (
			<div className={emptyClass} data-online-preset-loading>
				<p className={emptyTextClass}>{i18n.t("common:app.loading")}</p>
			</div>
		);
	}
	if (disconnected) {
		const retry = gatewayRetryAffordance(disconnectedReasonTag);
		return (
			<div
				className={emptyClass}
				data-online-preset-empty
				data-gateway-boot-reason={disconnectedReasonTag ?? ""}
			>
				<p className={listItemTitleClass}>
					{i18n.t("online:catalog.emptyUnavailable")}
				</p>
				{disconnectedReason ? (
					<p className={disconnectedReasonClass}>{disconnectedReason}</p>
				) : null}
				{/* jobs6 (#792): a bare icon button gave no visible
				    affordance — the retry action carries its label, same
				    contract as the catalog dialog's EmptyState (#767). */}
				<Button
					variant="outline"
					uiSize="sm"
					title={retry.title}
					disabled={retry.disabled}
					onClick={onRefresh}
				>
					<Icon icon={RefreshCw} size={16} />{" "}
					{i18n.t("online:catalog.refreshCatalog")}
				</Button>
			</div>
		);
	}
	if (catalogLength === 0) {
		return (
			<div className={emptyClass} data-online-preset-empty>
				<p className={emptyTextClass}>
					{i18n.t("online:catalog.emptyNoCatalog")}
				</p>
				<Button
					variant="outline"
					uiSize="sm"
					title={i18n.t("online:catalog.refreshCatalog")}
					onClick={onRefresh}
				>
					<Icon icon={RefreshCw} size={16} />{" "}
					{i18n.t("online:catalog.refreshCatalog")}
				</Button>
			</div>
		);
	}
	if (filteredLength === 0) {
		return (
			<div className={emptyClass} data-online-preset-empty>
				<p className={emptyTextClass}>
					{i18n.t("online:catalog.emptyNoMatch")}
				</p>
				{/* jobs6 (#792): labelled clear-filters action — a bare "×"
				    was indistinguishable from a dismiss control. */}
				<Button
					variant="outline"
					uiSize="sm"
					title={i18n.t("online:catalog.clearAllFilters")}
					onClick={onClearFilters}
				>
					<Icon icon={FilterX} size={16} />{" "}
					{i18n.t("online:catalog.clearAllFilters")}
				</Button>
			</div>
		);
	}
	return null;
}
