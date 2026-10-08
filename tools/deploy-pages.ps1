# 소스 master와 www 빌드를 각각 GitHub / GitHub Pages에 배포한다.
$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1이 UTF-8 콘솔(코드 페이지 65001)에서는 git 표준 입력 앞에 BOM을 붙여 credential 요청이 거부된다.
# 같은 코드 페이지의 BOM 없는 UTF-8로 바꾼다.
if ($PSVersionTable.PSVersion.Major -lt 6 -and [Console]::InputEncoding.CodePage -eq 65001) { [Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false }
$projectDir = Split-Path -Parent $PSScriptRoot
$repoUrl = 'https://github.com/kongrae/bukang-sea.git'
$apiUrl = 'https://api.github.com/repos/kongrae/bukang-sea'
$repoDescription = '상어 SOS: 바다로 보내줘! — 상어 구출 슬라이드 퍼즐'
$pagesDir = Join-Path $projectDir 'outputs/pages'

function Run-Git {
    param([string[]]$GitArgs)
    & git @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "git failed: $($GitArgs -join ' ')" }
}

Push-Location $projectDir
try {
    # Git Credential Manager의 인증을 메모리에서만 사용한다. 출력/파일 저장 금지.
    $credential = @{}
    $credentialLines = "protocol=https`nhost=github.com`n`n" | git credential fill
    if ($LASTEXITCODE -ne 0) { throw 'GitHub 인증이 필요합니다.' }
    foreach ($line in $credentialLines) {
        $parts = $line -split '=', 2
        if ($parts.Length -eq 2) { $credential[$parts[0]] = $parts[1] }
    }
    if (-not $credential.password) { throw 'GitHub 인증이 필요합니다.' }
    $headers = @{ Authorization = 'Bearer ' + $credential.password; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
    $account = Invoke-RestMethod https://api.github.com/user -Headers $headers
    if ($account.login -ne 'kongrae') { throw '배포 계정이 kongrae가 아닙니다.' }
    try { $repo = Invoke-RestMethod $apiUrl -Headers $headers }
    catch {
        if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }
        $body = @{ name = 'bukang-sea'; description = $repoDescription; private = $false } | ConvertTo-Json
        $repo = Invoke-RestMethod https://api.github.com/user/repos -Method Post -Headers $headers -ContentType 'application/json' -Body $body
    }
    if ($repo.description -ne $repoDescription) {
        $body = @{ description = $repoDescription } | ConvertTo-Json
        $repo = Invoke-RestMethod $apiUrl -Method Patch -Headers $headers -ContentType 'application/json' -Body $body
    }
    $origin = git remote get-url origin 2>$null
    if ($LASTEXITCODE -ne 0) { Run-Git -GitArgs @('remote', 'add', 'origin', $repoUrl) }
    elseif ($origin -ne $repoUrl) { throw 'origin 주소가 배포 저장소와 다릅니다.' }

    & npm.cmd run build:web
    if ($LASTEXITCODE -ne 0) { throw '웹 빌드 실패' }
    Run-Git -GitArgs @('push', '-u', 'origin', 'master')

    if (-not (Test-Path (Join-Path $pagesDir '.git'))) {
        New-Item -ItemType Directory -Path $pagesDir -Force | Out-Null
        Run-Git -GitArgs @('-C', $pagesDir, 'init', '-b', 'gh-pages')
        Run-Git -GitArgs @('-C', $pagesDir, 'remote', 'add', 'origin', $repoUrl)
    }
    Run-Git -GitArgs @('-C', $pagesDir, 'config', 'user.name', 'kongrae')
    Run-Git -GitArgs @('-C', $pagesDir, 'config', 'user.email', 'ghdfo918@gmail.com')
    Copy-Item (Join-Path $projectDir 'www/*') -Destination $pagesDir -Recurse -Force
    New-Item -ItemType File -Path (Join-Path $pagesDir '.nojekyll') -Force | Out-Null
    $sourceCommit = git rev-parse HEAD
    # BOM 없는 UTF-8(Windows PowerShell 5.1의 Set-Content -Encoding utf8은 BOM을 붙인다)
    $versionJson = @{ sourceCommit = $sourceCommit; builtAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $pagesDir 'version.json'), $versionJson, (New-Object System.Text.UTF8Encoding $false))
    Run-Git -GitArgs @('-C', $pagesDir, 'add', '-A')
    & git -C $pagesDir diff --cached --quiet
    if ($LASTEXITCODE -eq 1) { Run-Git -GitArgs @('-C', $pagesDir, 'commit', '-m', "웹 배포: $sourceCommit") }
    elseif ($LASTEXITCODE -ne 0) { throw '배포 변경 확인 실패' }
    Run-Git -GitArgs @('-C', $pagesDir, 'push', '-u', 'origin', 'gh-pages')

    $pagesBody = @{ build_type = 'legacy'; source = @{ branch = 'gh-pages'; path = '/' } } | ConvertTo-Json
    try {
        $pages = Invoke-RestMethod "$apiUrl/pages" -Headers $headers
    } catch {
        if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }
        try {
            $pages = Invoke-RestMethod "$apiUrl/pages" -Method Post -Headers $headers -ContentType 'application/json' -Body $pagesBody
        } catch {
            # gh-pages 첫 push와 동시에 GitHub가 사이트를 자동 활성화할 수 있다.
            if ([int]$_.Exception.Response.StatusCode -ne 409) { throw }
            $pages = Invoke-RestMethod "$apiUrl/pages" -Headers $headers
        }
    }
    if ($pages.build_type -ne 'legacy' -or $pages.source.branch -ne 'gh-pages' -or $pages.source.path -ne '/') {
        $pages = Invoke-RestMethod "$apiUrl/pages" -Method Put -Headers $headers -ContentType 'application/json' -Body $pagesBody
    }
    Write-Output 'https://kongrae.github.io/bukang-sea/'
} finally {
    if ($credential) { $credential.Clear() }
    if ($headers) { $headers.Clear() }
    $credentialLines = $null
    Pop-Location
}
