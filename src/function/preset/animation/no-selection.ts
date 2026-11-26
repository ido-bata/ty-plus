/**
 * Classifies the authoring host's "no layer selected" failure.
 *
 * The host bundle throws the precondition message verbatim from
 * `payload.messages.selectLayerToSave`, which the dialog localizes. Matching
 * on the English text alone breaks in every non-English locale, so the
 * dialog passes the exact string it sent and we match on containment. The
 * English regex remains as the fallback for callers that do not supply a
 * message (the host then uses its built-in English default).
 */
export const isNoSelectionHostError = (
	error: { code: string; message: string },
	expectedMessage?: string,
): boolean => {
	if (error.code !== "host-preparation-failed") return false;
	if (expectedMessage) return error.message.includes(expectedMessage);
	return /select at least one layer/i.test(error.message);
};
