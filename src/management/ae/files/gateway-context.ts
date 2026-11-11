import { createContext, useContext } from "react";
import type { AfterEffectsFilesRuntimeGateway } from "./runtime-gateway-impl";

/**
 * React Context for the After Effects files runtime gateway.
 *
 * The directory browser widget looks up cached thumbnails and triggers
 * generation via this gateway. The gateway itself is built from the
 * runtime dispatcher in production; tests inject a mock here instead.
 *
 * Provider convention:
 *   `<AfterEffectsFilesGatewayProvider value={gw}>{children}</...>`
 *
 * Consumer convention:
 *   `const gw = useAfterEffectsFilesGateway();`
 *
 * The context is intentionally nullable: `useThumbnail` returns
 * `status: "idle"` (without throwing) when the provider has not been
 * mounted, so a missing gateway in tests is observable instead of fatal.
 */
const AfterEffectsFilesGatewayContext =
	createContext<AfterEffectsFilesRuntimeGateway | null>(null);

export const AfterEffectsFilesGatewayProvider =
	AfterEffectsFilesGatewayContext.Provider;

export const useAfterEffectsFilesGateway =
	(): AfterEffectsFilesRuntimeGateway | null =>
		useContext(AfterEffectsFilesGatewayContext);
