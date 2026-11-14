/**
 * First-import side effect for every CEP surface entry (Issue #71).
 *
 * Must be imported before `@/management/panel/appearance-boot` and every
 * other module that can schedule timers at evaluation time, so the guard's
 * patched timer APIs are already in place when the first `setTimeout` /
 * `setInterval` / `requestAnimationFrame` call happens.
 */
import { installUnloadGuard } from "@/management/ae/cep/unload-guard";

if (typeof window !== "undefined") {
	installUnloadGuard(window);
}
