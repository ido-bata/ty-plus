/**
 * First-import side effect for every CEP surface entry (issue 139).
 *
 * Installed alongside the unload guard so no CEP window — panel or
 * modeless dialog — can be navigated away by an OS file drop before
 * React mounts. See `drop-guard.ts` for the invariant.
 */
import { installDropGuard } from "@/management/ae/cep/drop-guard";

if (typeof window !== "undefined") {
	installDropGuard(window);
}
