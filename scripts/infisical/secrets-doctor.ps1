param()

$ErrorActionPreference = "Stop"

$endpoint = "https://secrets.rebuildup.dev"
$projectId = "4a42939b-5be2-47e7-8a23-f8931dfe2b1d"
$environment = "dev"
$requiredValues = (Import-PowerShellDataFile -Path (Join-Path $PSScriptRoot "required-values.psd1")).RequiredValues

function Write-Check([string]$name, [bool]$passed, [string]$detail) {
	$status = if ($passed) { "OK" } else { "FAIL" }
	Write-Output ("[{0}] {1}: {2}" -f $status, $name, $detail)
}

if ($PSVersionTable.PSVersion.Major -lt 7) {
	Write-Check "PowerShell" $false "PowerShell 7 or later is required."
	exit 1
}
Write-Check "PowerShell" $true $PSVersionTable.PSVersion.ToString()

$bindingPath = Join-Path (Get-Location) ".infisical.json"
$bindingValid = $false
if (Test-Path -LiteralPath $bindingPath) {
	try {
		$binding = Get-Content -LiteralPath $bindingPath -Raw | ConvertFrom-Json
		$bindingValid =
			$binding.workspaceId -eq $projectId -and
			$binding.defaultEnvironment -eq $environment -and
			$binding.domain.TrimEnd("/") -eq $endpoint
	} catch {
		$bindingValid = $false
	}
}
Write-Check "Project binding" $bindingValid ("project={0}; environment={1}; endpoint={2}" -f $projectId, $environment, $endpoint)

$cliCommand = Get-Command infisical -ErrorAction SilentlyContinue
$cliPath = if ($cliCommand) { $cliCommand.Source } else { $null }
if (-not $cliPath) {
	$wingetCli = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\infisical.exe"
	if (Test-Path -LiteralPath $wingetCli) { $cliPath = $wingetCli }
}
if (-not $cliPath) {
	Write-Check "Infisical CLI" $false "Install with: winget install --id infisical.infisical --exact"
	exit 1
}
Write-Check "Infisical CLI" $true "available"

$authOutput = & $cliPath login status --domain $endpoint 2>&1
$authText = ($authOutput | ForEach-Object { [string]$_ }) -join "`n"
# `login status` is informational rather than a gate: several CLI versions
# print "You are not logged in." to stdout and still exit 0, so the exit
# code alone cannot carry the verdict. Require an explicit stdout marker,
# matching the `looksAuthenticated` contract in scripts/infisical/setup.ts.
# The negative form is tested first because it contains the positive one.
$authNegative = $authText -match '(?i)\bnot\s+(?:logged\s*in|authenticated)\b'
$authPositive = $authText -match '(?i)\b(?:logged\s*in|authenticated)\b'
$authValid = ($LASTEXITCODE -eq 0) -and (-not $authNegative) -and $authPositive
$authDetail = if ($authValid) {
	"authenticated to self-hosted endpoint"
} else {
	# Capture stdout+stderr so a non-zero exit with a CLI hint (deprecation
	# warning, network error, etc.) is visible to the operator instead of
	# being swallowed behind a generic "run: infisical login" message.
	$hint = ($authOutput | Select-Object -First 1)
	if ($hint) { "run: infisical login --domain $endpoint (cli: $hint)" }
	else { "run: infisical login --domain $endpoint" }
}
Write-Check "Authentication" $authValid $authDetail

if (-not $bindingValid -or -not $authValid) {
	exit 1
}

$childCheck = @'
# Names JSON arrives as a positional argument via `--`, not as an env var,
# so the heredoc body is free of implicit shell quoting.
$namesJson = $args[0]
$names = $namesJson | ConvertFrom-Json
$missing = $names | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
foreach ($name in $names) {
    if ($missing -contains $name) { Write-Output ("MISSING:{0}" -f $name) }
    else { Write-Output ("INJECTED:{0}" -f $name) }
}
if ($missing.Count -gt 0) { exit 2 }
exit 0
'@

$namesJson = $requiredValues | ConvertTo-Json -Compress
$previousValues = @{}
foreach ($name in $requiredValues) {
	$previousValues[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
	[Environment]::SetEnvironmentVariable($name, $null, "Process")
}
try {
	$injectionOutput = & $cliPath run --domain $endpoint --projectId $projectId --env $environment --path / --path /config -- pwsh -NoProfile -Command $childCheck -- $namesJson 2>&1
	$injectionExit = $LASTEXITCODE
} catch {
	# $ErrorActionPreference = "Stop" turns a non-zero child exit into a
	# terminating error; record it so the verdict below can surface the
	# failure rather than silently reporting an empty injection.
	$injectionOutput = @()
	$injectionExit = 1
} finally {
	foreach ($name in $requiredValues) {
		[Environment]::SetEnvironmentVariable($name, $previousValues[$name], "Process")
	}
}

$injected = @($injectionOutput | ForEach-Object { [string]$_ } | Where-Object { $_ -match '^INJECTED:' })
$missing = @($injectionOutput | ForEach-Object { [string]$_ } | Where-Object { $_ -match '^MISSING:' })
$expectedCount = $requiredValues.Count
$injectionOk = ($injectionExit -eq 0) -and ($injected.Count -eq $expectedCount)
foreach ($entry in $injected) { Write-Check "Runtime injection" $true ($entry -replace '^INJECTED:', "") }
foreach ($entry in $missing) { Write-Check "Required Infisical value" $false ($entry -replace '^MISSING:', "") }
if (-not $injectionOk) {
	Write-Check "Runtime injection" $false ("Infisical reported {0} of {1} values (exit={2})." -f $injected.Count, $expectedCount, $injectionExit)
}

if (-not $injectionOk) { exit 1 }
exit 0
