$ErrorActionPreference = 'Stop'
$npmCommand = if ($env:OS -eq 'Windows_NT') { 'npm.cmd' } else { 'npm' }
Push-Location (Join-Path $PSScriptRoot '..')
try {
    dotnet restore OutdoorExplorer.slnx --locked-mode
    if ($LASTEXITCODE) { throw 'Restore failed' }
    dotnet build OutdoorExplorer.slnx --no-restore
    if ($LASTEXITCODE) { throw 'Build failed' }
    dotnet format OutdoorExplorer.slnx --no-restore --verify-no-changes
    if ($LASTEXITCODE) { throw 'Formatting failed' }
    dotnet test OutdoorExplorer.slnx --no-build --filter 'Category!=Live'
    if ($LASTEXITCODE) { throw 'API tests failed' }
    & $npmCommand --prefix src/web ci
    if ($LASTEXITCODE) { throw 'Frontend install failed' }
    foreach ($task in @('lint', 'test', 'build')) {
        & $npmCommand --prefix src/web run $task
        if ($LASTEXITCODE) { throw "Frontend $task failed" }
    }
    & $npmCommand --prefix tests/e2e ci
    if ($LASTEXITCODE) { throw 'E2E install failed' }
    foreach ($task in @('typecheck', 'lint', 'install:browsers', 'test')) {
        & $npmCommand --prefix tests/e2e run $task
        if ($LASTEXITCODE) { throw "E2E $task failed" }
    }
}
finally { Pop-Location }
