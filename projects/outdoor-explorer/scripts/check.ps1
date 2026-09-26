$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    dotnet restore OutdoorExplorer.slnx --locked-mode
    if ($LASTEXITCODE) { throw 'Restore failed' }
    dotnet build OutdoorExplorer.slnx --no-restore
    if ($LASTEXITCODE) { throw 'Build failed' }
    dotnet format OutdoorExplorer.slnx --no-restore --verify-no-changes
    if ($LASTEXITCODE) { throw 'Formatting failed' }
    dotnet test OutdoorExplorer.slnx --no-build
    if ($LASTEXITCODE) { throw 'API tests failed' }
    npm --prefix src/web ci
    if ($LASTEXITCODE) { throw 'Frontend install failed' }
    foreach ($task in @('lint', 'test', 'build')) {
        npm --prefix src/web run $task
        if ($LASTEXITCODE) { throw "Frontend $task failed" }
    }
}
finally { Pop-Location }
