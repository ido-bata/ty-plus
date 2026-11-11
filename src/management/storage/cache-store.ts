/**
 * @deprecated Compatibility barrel only.
 * Use `management/storage/read/cache-store` for reads and
 * `management/storage/write/cache-store` for mutations.
 */

export {
	readNotifications,
	readPublicLinks,
	readRemotePresets,
} from "@/management/storage/read/cache-store";
export {
	writeNotifications,
	writePublicLinks,
	writeRemotePresets,
} from "@/management/storage/write/cache-store";
