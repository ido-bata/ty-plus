import { RefreshCw, X } from "lucide-react";
import type { JSX } from "react";
import { gatewayRetryAffordance } from "@/management/online/catalog/gateway-retry";
import type { GatewayBootFailureReason } from "@/management/panel/cloud-gateway-boot";
import { IconButton } from "@/shared/component/controls/IconButton";
import { Icon } from "@/shared/component/icons/Icon";
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

const disconnectedTitleClass = css({
	fontSize: "sm",
	fontWeight: "medium",
	color: "text.primary",
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
	if (loading) return null;
	if (disconnected) {
		const retry = gatewayRetryAffordance(disconnectedReasonTag);
		return (
			<div
				className={emptyClass}
				data-online-preset-empty
				data-gateway-boot-reason={disconnectedReasonTag ?? ""}
			>
				<p className={disconnectedTitleClass}>
					Online preset library is unavailable.
				</p>
				{disconnectedReason ? (
					<p className={disconnectedReasonClass}>{disconnectedReason}</p>
				) : null}
				<IconButton
					size="sm"
					variant="ghost"
					title={retry.title}
					disabled={retry.disabled}
					onClick={onRefresh}
				>
					<Icon icon={RefreshCw} size={14} />
				</IconButton>
			</div>
		);
	}
	if (catalogLength === 0) {
		return (
			<div className={emptyClass} data-online-preset-empty>
				<p className={emptyTextClass}>No online catalog.</p>
				<IconButton
					size="sm"
					variant="ghost"
					title="Refresh catalog"
					onClick={onRefresh}
				>
					<Icon icon={RefreshCw} size={14} />
				</IconButton>
			</div>
		);
	}
	if (filteredLength === 0) {
		return (
			<div className={emptyClass} data-online-preset-empty>
				<p className={emptyTextClass}>No presets match filter.</p>
				<IconButton
					size="sm"
					variant="ghost"
					title="Clear all filters"
					onClick={onClearFilters}
				>
					<Icon icon={X} size={12} />
				</IconButton>
			</div>
		);
	}
	return null;
}
