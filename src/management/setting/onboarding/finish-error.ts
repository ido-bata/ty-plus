/**
 * Structured error type for onboarding finish-phase failures.
 *
 * The original onboarding finish handler caught generic `Error` objects and
 * surfaced only the message string. With the structured reason codes in
 * `OnboardingFinishErrorReason`, the UI dialog can compose a localized
 * message from path + reason + next action.
 *
 * Issue #53: the previous enum carried `support_root_outside_trusted_roots`
 * and `support_root_not_writable_by_admin`, which were predicated on the
 * user-data-root policy that the user rejected as fundamentally wrong for
 * AE Support Files. Only UAC / write outcome is now relevant here.
 */

export type OnboardingFinishErrorReason =
	/**
	 * The standard write failed AND the elevated write failed.
	 * `nextAction` carries which path the user can retry on.
	 */
	| "write_rejected_other"
	/** The locator's `core.paths.supportRoot` was missing or blank. */
	| "missing_support_root";

export type OnboardingFinishErrorPlatform = "windows" | "mac" | "unknown";

export type OnboardingFinishNextAction =
	/** The standard write failed — try again with elevation, or run AE as Administrator. */
	| "retry_with_elevation"
	/** No elevation path is available on this platform — check perms/path and retry. */
	| "adjust_support_root"
	/** The settings JSON itself didn't include core.paths.supportRoot. */
	| "choose_trusted_root";

export interface OnboardingFinishErrorStructuredFields {
	readonly phase: string;
	readonly path: string;
	readonly reasonCode: OnboardingFinishErrorReason;
	/** Human-readable reason suitable for the developer console. */
	readonly reasonDetail: string;
	readonly platform: OnboardingFinishErrorPlatform;
	readonly canAttemptElevation: boolean;
	/** The next action the user should take; matched by locale string. */
	readonly nextAction: OnboardingFinishNextAction;
}

export class OnboardingFinishError
	extends Error
	implements OnboardingFinishErrorStructuredFields
{
	readonly phase: string;
	readonly path: string;
	readonly reasonCode: OnboardingFinishErrorReason;
	readonly reasonDetail: string;
	readonly platform: OnboardingFinishErrorPlatform;
	readonly canAttemptElevation: boolean;
	readonly nextAction: OnboardingFinishNextAction;

	constructor(fields: OnboardingFinishErrorStructuredFields) {
		const { phase, path, reasonDetail } = fields;
		const composed = `[onboarding finish:${phase}] ${reasonDetail} (path=${path})`;
		super(composed);
		this.name = "OnboardingFinishError";
		this.phase = phase;
		this.path = path;
		this.reasonCode = fields.reasonCode;
		this.reasonDetail = reasonDetail;
		this.platform = fields.platform;
		this.canAttemptElevation = fields.canAttemptElevation;
		this.nextAction = fields.nextAction;
	}
}
