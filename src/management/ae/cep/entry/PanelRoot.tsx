import { type ReactNode, StrictMode } from "react";

import {
	type CepContextValue,
	CepProvider,
} from "@/management/ae/cep/contexts/Context";
import { ThemeProvider } from "@/management/ae/cep/contexts/ThemeContext";
import { AfterEffectsFilesGatewayProvider } from "@/management/ae/files/gateway-context";
import type { AfterEffectsFilesRuntimeGateway } from "@/management/ae/files/runtime-gateway-impl";
import { I18nProvider } from "@/management/i18n/Context";
import { LicenseProvider } from "@/management/online/licensing/LicenseContext";
import { SettingsProvider } from "@/management/setting/context";

export const PanelRoot = ({
	value,
	gateway,
	children,
}: {
	value: CepContextValue;
	/**
	 * Optional thumbnail gateway. When provided, the panel mounts an
	 * `AfterEffectsFilesGatewayProvider` so the directory browser and
	 * preset sidecar renderers can resolve WebP cache URLs through the
	 * Rust worker. When omitted (test/dev-only path), `useThumbnail`
	 * returns `status: "idle"` and falls back to glyph rendering.
	 */
	gateway?: AfterEffectsFilesRuntimeGateway | null;
	children: ReactNode;
}) => (
	<StrictMode>
		<CepProvider value={value}>
			<SettingsProvider>
				<LicenseProvider>
					<I18nProvider>
						<AfterEffectsFilesGatewayProvider value={gateway ?? null}>
							<ThemeProvider panelSurfaceId={value.panelSurfaceId}>
								{children}
							</ThemeProvider>
						</AfterEffectsFilesGatewayProvider>
					</I18nProvider>
				</LicenseProvider>
			</SettingsProvider>
		</CepProvider>
	</StrictMode>
);
