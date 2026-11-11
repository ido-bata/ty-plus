import {
	clearStoredLicense,
	readStoredLicense,
	writeStoredLicense,
} from "@/management/online/licensing/storage";
import type {
	Gateway,
	Info,
	ValidateRemote,
	ValidationResult,
} from "@/management/online/licensing/types";

export const createDefaultInfo = (
	productId: string,
	productVersion: string,
): Info => ({
	status: "not-registered",
	type: "trial",
	productId,
	productVersion,
});

export const createGateway = (options: {
	productId: string;
	productVersion: string;
	validateRemote?: ValidateRemote;
}): Gateway => {
	const validateRemote =
		options.validateRemote ??
		(async () => ({
			valid: false,
			info: {
				...createDefaultInfo(options.productId, options.productVersion),
				status: "invalid",
			},
			errorMessage: "License validation unavailable",
		}));

	const normalize = (info: Info): Info => ({
		...info,
		productId: info.productId || options.productId,
		productVersion: info.productVersion || options.productVersion,
	});

	return {
		async validate(code: string): Promise<ValidationResult> {
			return validateRemote(code);
		},
		async activate(code: string): Promise<ValidationResult> {
			const result = await validateRemote(code);
			if (result.valid) {
				writeStoredLicense(normalize(result.info));
			}
			return result;
		},
		async deactivate(): Promise<void> {
			clearStoredLicense();
		},
		getStoredLicense(): Info | null {
			return readStoredLicense();
		},
		clearStoredLicense(): void {
			clearStoredLicense();
		},
	};
};
