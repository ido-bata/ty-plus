$ErrorActionPreference = "Stop"

$CommandArgs = @($args)

$endpoint = "https://secrets.rebuildup.dev"
$projectId = "4a42939b-5be2-47e7-8a23-f8931dfe2b1d"
$environment = "dev"
$managedNames = (Import-PowerShellDataFile -Path (Join-Path $PSScriptRoot "required-values.psd1")).ManagedNames

if ($PSVersionTable.PSVersion.Major -lt 7) {
	[Console]::Error.WriteLine("PowerShell 7 or later is required.")
	exit 1
}
if (-not $CommandArgs -or $CommandArgs.Count -eq 0) {
	[Console]::Error.WriteLine("Usage: bun run secrets:run -- <command> [arguments...]")
	exit 2
}

$binding = Get-Content -LiteralPath (Join-Path (Get-Location) ".infisical.json") -Raw | ConvertFrom-Json
if ($binding.workspaceId -ne $projectId -or $binding.defaultEnvironment -ne $environment -or $binding.domain.TrimEnd("/") -ne $endpoint) {
	[Console]::Error.WriteLine("The repository Infisical binding does not match the ty-plus self-hosted project.")
	exit 1
}

$cliCommand = Get-Command infisical -ErrorAction SilentlyContinue
$cliPath = if ($cliCommand) { $cliCommand.Source } else { $null }
if (-not $cliPath) {
	$wingetCli = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\infisical.exe"
	if (Test-Path -LiteralPath $wingetCli) { $cliPath = $wingetCli }
}
if (-not $cliPath) {
	[Console]::Error.WriteLine("Infisical CLI is unavailable. Install it with: winget install --id infisical.infisical --exact")
	exit 1
}

$previousValues = @{}
foreach ($name in $managedNames) {
	$previousValues[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
	[Environment]::SetEnvironmentVariable($name, $null, "Process")
}
# The argument vector is built by a dot-sourceable helper so that
# scripts/infisical/run.test.ts can assert against a real child process
# instead of re-deriving the quoting rules. Do not re-add manual quoting
# here: splatting already forwards one argv entry per element.
. (Join-Path $PSScriptRoot "wrapper-argv.ps1")
$commandArgv = New-InfisicalRunArgv -CommandArgs $CommandArgs
try {
	& $cliPath run --domain $endpoint --projectId $projectId --env $environment --path / --path /config -- @commandArgv
	$exitCode = $LASTEXITCODE
} finally {
	foreach ($name in $managedNames) {
		[Environment]::SetEnvironmentVariable($name, $previousValues[$name], "Process")
	}
}

exit $exitCode
