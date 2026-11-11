# Driver used by scripts/infisical/run.test.ts.
#
# Mirrors the invocation in scripts/infisical/run.ps1, but against the
# `echo-argv.ps1` child instead of the Infisical CLI. Tokens arrive through
# the environment rather than argv on purpose: forwarding them as argv would
# make the very mechanism under test the thing that could corrupt them.
#
#   INFISICAL_WRAPPER_TEST_TOKENS  JSON array of the tokens to forward
#   INFISICAL_WRAPPER_TEST_MODE    optional $PSNativeCommandArgumentPassing
#                                  override ("Windows" / "Standard")

$ErrorActionPreference = "Stop"

$wrapperPath = Join-Path (Split-Path -Parent $PSScriptRoot) "wrapper-argv.ps1"
. $wrapperPath

$mode = $env:INFISICAL_WRAPPER_TEST_MODE
if ($mode) {
	$global:PSNativeCommandArgumentPassing = $mode
}

$tokens = @($env:INFISICAL_WRAPPER_TEST_TOKENS | ConvertFrom-Json)
$commandArgv = New-InfisicalRunArgv -CommandArgs ([string[]] $tokens)

& pwsh -NoProfile -File (Join-Path $PSScriptRoot "echo-argv.ps1") @commandArgv
exit $LASTEXITCODE