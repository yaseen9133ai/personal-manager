param(
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$ImageName = "personal-manager-backend"
$ContainerName = "personal-manager"

docker build -t $ImageName .

$existing = docker ps -a --filter "name=^/$ContainerName$" --format "{{.Names}}"
if ($existing) {
    docker rm -f $ContainerName | Out-Null
}

docker run -d `
  --name $ContainerName `
  --env-file .env `
  -p "${Port}:8000" `
  $ImageName

Write-Host "Running at http://localhost:$Port"
