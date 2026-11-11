# Child process used by scripts/infisical/run.test.ts.
#
# Invoked as `pwsh -NoProfile -File echo-argv.ps1 <args...>`, so `$args` is
# exactly the argv the operating system handed this process. Printing it as
# JSON lets the test observe the real received arguments — including spaces
# and embedded quotes — instead of asserting on a string we built ourselves.
#
# `-Command` cannot be used for this: PowerShell re-parses everything after
# it as script text, so a token containing spaces is split before it ever
# reaches the child.

Write-Output ($args | ConvertTo-Json -Compress)
exit 0