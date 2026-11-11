import type { Info } from "@/management/online/licensing/types";

let memoryLicense: Info | null = null;

export const readStoredLicense = (): Info | null => memoryLicense;

export const writeStoredLicense = (info: Info): void => {
	memoryLicense = info;
};

export const clearStoredLicense = (): void => {
	memoryLicense = null;
};
