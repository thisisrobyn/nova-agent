<#
.SYNOPSIS
    Registers the NOVA application in Microsoft Entra ID (Azure AD).

.DESCRIPTION
    Creates the app registration, adds the delegated Microsoft Graph
    permissions NOVA needs, generates a client secret and prints the
    credentials to paste into the connections panel.

    Requires the Azure CLI (https://aka.ms/azure-cli) and an account allowed
    to register applications in the directory.

.PARAMETER DisplayName
    Name of the app registration. Defaults to "NOVA Agent".

.PARAMETER PublicUrl
    Base URL of the NOVA deployment, used to build the redirect URI.
    Must match NOVA_PUBLIC_URL. Defaults to http://localhost:5173.

.EXAMPLE
    ./scripts/setup_microsoft_app.ps1
    ./scripts/setup_microsoft_app.ps1 -PublicUrl https://nova.example.com
#>

[CmdletBinding()]
param(
    [string]$DisplayName = 'NOVA Agent',
    [string]$PublicUrl = 'http://localhost:5173'
)

$ErrorActionPreference = 'Stop'

$redirectUri = "$($PublicUrl.TrimEnd('/'))/api/v1/connections/microsoft/callback"

# Microsoft Graph delegated permissions NOVA requests, by well-known GUID.
$graphAppId = '00000003-0000-0000-c000-000000000000'
$delegatedScopes = @{
    'User.Read'            = 'e1fe6dd8-ba31-4d61-89e7-88639da4683d'
    'Mail.Read'            = '570282fd-fa5c-430d-a7fd-fc8dc98a9dca'
    'Mail.Send'            = 'e383f46e-2787-4529-855e-0e479a3ffac0'
    'Calendars.ReadWrite'  = '1ec239c2-d7c9-4623-a91a-a9775856a684'
    'Files.ReadWrite'      = '5c28f0bf-8a70-41f1-8ab2-9032436ddb65'
    'offline_access'       = '7427e0e9-2fba-42fe-b0c0-848c9e6a8182'
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI not found. Install it from https://aka.ms/azure-cli and run "az login".'
}

Write-Host "Registering '$DisplayName'..." -ForegroundColor Cyan
Write-Host "  Redirect URI: $redirectUri"

$appId = az ad app create `
    --display-name $DisplayName `
    --sign-in-audience AzureADandPersonalMicrosoftAccount `
    --web-redirect-uris $redirectUri `
    --query appId -o tsv

if (-not $appId) { throw 'Failed to create the app registration.' }
Write-Host "  Application (client) ID: $appId" -ForegroundColor Green

Write-Host 'Adding Microsoft Graph delegated permissions...' -ForegroundColor Cyan
foreach ($name in $delegatedScopes.Keys) {
    az ad app permission add `
        --id $appId `
        --api $graphAppId `
        --api-permissions "$($delegatedScopes[$name])=Scope" `
        --only-show-errors | Out-Null
    Write-Host "  + $name"
}

Write-Host 'Creating a client secret...' -ForegroundColor Cyan
$secret = az ad app credential reset `
    --id $appId `
    --display-name 'nova-agent' `
    --years 2 `
    --query password -o tsv

if (-not $secret) { throw 'Failed to create a client secret.' }

Write-Host ''
Write-Host '───────────────────────────────────────────────' -ForegroundColor DarkGray
Write-Host 'Paste these into the NOVA connections panel:' -ForegroundColor Yellow
Write-Host ''
Write-Host "  Client ID     : $appId"
Write-Host "  Client secret : $secret"
Write-Host "  Tenant        : common"
Write-Host ''
Write-Host 'The secret is shown only once — copy it now.' -ForegroundColor DarkYellow
Write-Host '───────────────────────────────────────────────' -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Personal Microsoft accounts consent on their own. In a work tenant an'
Write-Host 'administrator may still need to grant admin consent for these permissions.'
