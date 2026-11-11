# Builds the argument vector that `scripts/infisical/run.ps1` forwards to
# `infisical run`. Dot-source this file, then call `New-InfisicalRunArgv`.
#
# It replaces two defects that were both observed by inspecting the argv a
# real child process actually received (see scripts/infisical/run.test.ts):
#
#   1. A literal "--" was prepended here while the caller already supplies a
#      separator, so the CLI tried to execute a program named "--".
#   2. Every token was manually wrapped in double quotes with any embedded
#      quote backslash-escaped. PowerShell splatting already quotes each
#      element, so those quotes survived as literal characters and the
#      backslashes were doubled: `say "hi"` arrived as `say \"hi\"`, and
#      `bun` arrived as `"bun"`.
#
# The remaining implementation is intentionally trivial: splatting an array
# forwards exactly one argv entry per element, preserving spaces and embedded
# quotes, under both the Windows and Standard native argument passing modes.
# Anything cleverer here has to be justified by that observation.

function New-InfisicalRunArgv {
	param(
		[Parameter(Mandatory = $true)]
		[string[]] $CommandArgs
	)

	if (-not $CommandArgs -or $CommandArgs.Count -eq 0) {
		throw "New-InfisicalRunArgv requires at least one command token."
	}

	# The leading comma keeps PowerShell from unrolling the array into the
	# pipeline, so callers always receive the string[] they can splat.
	return , $CommandArgs
}