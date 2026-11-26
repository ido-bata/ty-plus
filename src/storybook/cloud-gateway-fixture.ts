/**
 * `CloudGateway` fixtures for Storybook stories of the online surfaces
 * (`management/online/*`). Kept separate from `online-services.tsx` so that
 * file only exports components (Fast Refresh / react-doctor
 * `only-export-components`).
 */

import type {
	CloudGateway,
	NotificationSummary,
	PresetSearchItem,
} from "@/management/online/contract";

/**
 * `CloudGateway` fixture for the online catalog (`PresetLibrary`) and the
 * notification center. `searchPresets` returns `catalogItems` regardless of
 * params — the dialog filters client-side. `listNotifications` /
 * `getNotificationBlocks` feed `NotificationCenter`; leave them undefined
 * to exercise the static-feed fallback instead.
 */
export const createStorybookCloudGateway = (options: {
	catalogItems?: readonly PresetSearchItem[];
	notifications?: readonly NotificationSummary[];
	notificationBlocks?: Readonly<Record<string, unknown[]>>;
	isFixture?: boolean;
}): CloudGateway => {
	const { catalogItems, notifications, notificationBlocks, isFixture } =
		options;
	return {
		provider: "supabase",
		...(isFixture ? { isFixture: true as const } : {}),
		async resolvePreset(presetId) {
			throw new Error(`storybook-gateway:unresolved-preset:${presetId}`);
		},
		...(catalogItems
			? {
					async searchPresets() {
						return { items: [...catalogItems] };
					},
				}
			: {}),
		...(notifications
			? {
					async listNotifications() {
						return [...notifications];
					},
				}
			: {}),
		...(notificationBlocks
			? {
					async getNotificationBlocks(notificationId: string) {
						return notificationBlocks[notificationId] ?? [];
					},
				}
			: {}),
	};
};
