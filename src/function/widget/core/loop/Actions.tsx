/**
 * Loop widget action bar: apply/update and unapply buttons.
 */

import { Button } from "@ty-plus/ui";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@/styled-system/css";

export type ActionsProps = {
	applied: boolean;
	disabled: boolean;
	onApply: () => void;
	onUnapply: () => void;
};

export function Actions({
	applied,
	disabled,
	onApply,
	onUnapply,
}: ActionsProps): JSX.Element {
	const { t } = useTranslation("widgets");
	return (
		<div
			className={css({
				display: "flex",
				alignItems: "center",
				gap: "1",
				paddingInline: "2",
				paddingBlock: "1",
				borderTopWidth: "hairline",
				borderTopStyle: "solid",
				borderTopColor: "border.default",
			})}
		>
			<Button
				variant="primary"
				uiSize="sm"
				fullWidth
				disabled={disabled}
				data-ws-action="loop-apply-current"
				data-tutorial-target="loop-apply"
				onClick={onApply}
			>
				{applied ? t("loop.update") : t("easing.apply")}
			</Button>
			{applied ? (
				<Button
					variant="outline"
					uiSize="sm"
					disabled={disabled}
					data-ws-action="loop-unapply-current"
					onClick={onUnapply}
				>
					{t("loop.unapply")}
				</Button>
			) : null}
		</div>
	);
}
