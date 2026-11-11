type Kind = "trial" | "single" | "multi" | "floating";

export type Status =
	| "active"
	| "trial"
	| "expired"
	| "invalid"
	| "not-registered";

export type Info = {
	status: Status;
	type: Kind;
	licenseCode?: string;
	activatedAt?: string;
	expiresAt?: string;
	maxUsers?: number;
	productId: string;
	productVersion: string;
};

export type ValidationResult = {
	valid: boolean;
	info: Info;
	errorMessage?: string;
};

export type ValidateRemote = (code: string) => Promise<ValidationResult>;

export interface Gateway {
	validate(code: string): Promise<ValidationResult>;
	activate(code: string): Promise<ValidationResult>;
	deactivate(): Promise<void>;
	getStoredLicense(): Info | null;
	clearStoredLicense(): void;
}
