/**
 * Preset operations aggregator — Wave 0 C0
 *
 * Re-exports the operation lookup and eagerly registers every preset-type
 * operation. Operations are registered via `definePresetOperation` from
 * `operation-contract.ts`.
 *
 * This file is append-only — never edit existing operation registrations.
 */

export { getPresetOperation } from "../operation-contract";

// Auto-register every preset-type operation via side-effect import so none is
// forgotten (previously `footage` was missing). Each `<type>/operation.ts` calls
// `definePresetOperation(...)` on load. Glob runs eagerly at module init.
import.meta.glob("../*/operation.ts", { eager: true });
