const SENSITIVE_ERROR_PATTERNS = [
	/Bearer\s+[^\s,;]+/gi,
	/\bapikey\s*[=:]\s*[^\s,;]+/gi,
	/\blicense(?:Code|_code|\s+code)?\s*[=:]\s*[^\s,;]+/gi,
] as const;

export const sanitizeOnlineErrorMessage = (message: string): string => {
	let sanitized = message;
	for (const pattern of SENSITIVE_ERROR_PATTERNS) {
		sanitized = sanitized.replace(pattern, "[REDACTED]");
	}
	return sanitized;
};
