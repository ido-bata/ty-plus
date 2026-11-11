import {
	createContext,
	type JSX,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type { Info } from "@/management/online/licensing/index";
import {
	createDefaultInfo,
	createGateway,
	type FeatureId,
	hasFeatureAccess,
} from "@/management/online/licensing/index";

const PRODUCT_ID = "ty-plus";
const PRODUCT_VERSION = "0.6.0";

type LicenseContextValue = {
	licenseInfo: Info;
	isLicensed: boolean;
	isTrial: boolean;
	trialDaysRemaining?: number;
	allowsFeature: (feature: FeatureId) => boolean;
	activateLicense: (code: string) => Promise<void>;
	deactivateLicense: () => Promise<void>;
};

const LicenseContext = createContext<LicenseContextValue | null>(null);

const calculateTrialDaysRemaining = (licenseInfo: Info): number | undefined => {
	if (licenseInfo.status !== "trial" || !licenseInfo.expiresAt) {
		return undefined;
	}
	const remain = new Date(licenseInfo.expiresAt).getTime() - Date.now();
	if (!Number.isFinite(remain)) {
		return undefined;
	}
	return Math.max(0, Math.ceil(remain / (1000 * 60 * 60 * 24)));
};

export const LicenseProvider = ({
	children,
}: {
	children: ReactNode;
}): JSX.Element => {
	const gateway = useMemo(
		() =>
			createGateway({
				productId: PRODUCT_ID,
				productVersion: PRODUCT_VERSION,
			}),
		[],
	);

	const [licenseInfo, setLicenseInfo] = useState<Info>(
		() =>
			gateway.getStoredLicense() ??
			createDefaultInfo(PRODUCT_ID, PRODUCT_VERSION),
	);

	const activateLicense = useCallback(
		async (code: string) => {
			const result = await gateway.activate(code);
			setLicenseInfo(result.info);
		},
		[gateway],
	);

	const deactivateLicense = useCallback(async () => {
		await gateway.deactivate();
		setLicenseInfo(createDefaultInfo(PRODUCT_ID, PRODUCT_VERSION));
	}, [gateway]);

	const isLicensed = licenseInfo.status === "active";
	const isTrial = licenseInfo.status === "trial";
	const trialDaysRemaining = calculateTrialDaysRemaining(licenseInfo);

	const allowsFeature = useCallback(
		(feature: FeatureId): boolean =>
			hasFeatureAccess(feature, licenseInfo.status),
		[licenseInfo.status],
	);

	const value = useMemo<LicenseContextValue>(
		() => ({
			licenseInfo,
			isLicensed,
			isTrial,
			trialDaysRemaining,
			allowsFeature,
			activateLicense,
			deactivateLicense,
		}),
		[
			licenseInfo,
			isLicensed,
			isTrial,
			trialDaysRemaining,
			allowsFeature,
			activateLicense,
			deactivateLicense,
		],
	);

	return (
		<LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>
	);
};

const useLicense = (): LicenseContextValue => {
	const value = useContext(LicenseContext);
	if (!value) {
		throw new Error("useLicense must be used within LicenseProvider");
	}
	return value;
};
