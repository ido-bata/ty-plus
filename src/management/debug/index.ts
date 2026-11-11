// Debug barrel - re-exports from shared debug modules.

export {
	clearLogs,
	enableCepBroadcast,
	enableInterceptor,
	getMessages,
	initializeLogRetention,
	subscribe,
} from "@/management/debug/console/interceptor";
// Shared bridge exports
export { writeSharedLogs } from "@/management/debug/console/shared-bridge";
// DebugDialogRoot is exported from the ui sub-module directly (not via barrel to avoid transitive cep.config dependency in test environments)
export { DebugDialogRoot } from "@/management/debug/console/ui/dialog-root";
// Central diagnostic logger (Issue #129).
export { createLogger } from "@/management/debug/logger";
