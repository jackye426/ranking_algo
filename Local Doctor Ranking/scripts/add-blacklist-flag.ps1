param(
    [Parameter(Mandatory=$true)]
    [string]$DataFile,
    
    [Parameter(Mandatory=$true)]
    [string]$DoctorName,
    
    [string]$Notes = "Blacklisted - should not be recommended",
    [string]$Reason = "Blacklisted"
)

Write-Host "[Blacklist] Processing file: $DataFile"
Write-Host "[Blacklist] Searching for: $DoctorName"

# Create backup
$backupFile = $DataFile -replace '\.json$', "_backup_$(Get-Date -Format 'yyyyMMddHHmmss').json"
Write-Host "[Blacklist] Creating backup: $backupFile"
Copy-Item $DataFile $backupFile

# Read the JSON file in chunks and find the doctor
Write-Host "[Blacklist] Reading file..."

# Use Get-Content with -Raw for smaller files, or process line by line for large files
$fileSize = (Get-Item $DataFile).Length
Write-Host "[Blacklist] File size: $([math]::Round($fileSize / 1MB, 2)) MB"

# For very large files, we'll use a streaming approach with regex replacement
$content = Get-Content $DataFile -Raw -Encoding UTF8

# Escape special regex characters in doctor name
$escapedName = [regex]::Escape($DoctorName)

# Pattern to match the doctor's record
# Look for "name": "Doctor Name" followed by record content until closing brace
$pattern = "(`"name`":\s*`"$escapedName`"[^}]*)(})"

if ($content -match $pattern) {
    Write-Host "[Blacklist] ✅ Found doctor record"
    
    # Check if already blacklisted
    if ($content -match "`"name`":\s*`"$escapedName`"[^}]*`"blacklisted`"") {
        Write-Host "[Blacklist] ⚠️  Record already has blacklist flag, updating..."
        
        # Update existing blacklist fields
        $content = $content -replace "(`"name`":\s*`"$escapedName`"[^}]*?)`"blacklisted`":\s*[^,}]+", "`$1`"blacklisted`": true"
        $content = $content -replace "(`"name`":\s*`"$escapedName`"[^}]*?)`"blacklistedDate`":\s*`"[^`"]*`"", "`$1`"blacklistedDate`": `"$(Get-Date -Format 'yyyy-MM-dd')`""
        $content = $content -replace "(`"name`":\s*`"$escapedName`"[^}]*?)`"blacklistNotes`":\s*`"[^`"]*`"", "`$1`"blacklistNotes`": `"$($Notes -replace '"', '\"')`""
        $content = $content -replace "(`"name`":\s*`"$escapedName`"[^}]*?)`"blacklistReason`":\s*`"[^`"]*`"", "`$1`"blacklistReason`": `"$($Reason -replace '"', '\"')`""
    } else {
        Write-Host "[Blacklist] Adding blacklist fields..."
        
        # Add blacklist fields before the closing brace
        $blacklistFields = ",`n      `"blacklisted`": true,`n      `"blacklistedDate`": `"$(Get-Date -Format 'yyyy-MM-dd')`",`n      `"blacklistNotes`": `"$($Notes -replace '"', '\"')`",`n      `"blacklistReason`": `"$($Reason -replace '"', '\"')`""
        
        $content = $content -replace "(`"name`":\s*`"$escapedName`"[^}]*)(})", "`$1$blacklistFields`$2"
    }
    
    # Write back to file
    Write-Host "[Blacklist] Saving updated file..."
    $content | Set-Content $DataFile -Encoding UTF8 -NoNewline
    
    Write-Host "[Blacklist] ✅ Successfully updated $DataFile"
    exit 0
} else {
    Write-Host "[Blacklist] ❌ Doctor not found with exact name"
    Write-Host "[Blacklist] Trying alternative patterns..."
    
    # Try without title prefix
    $nameWithoutTitle = $DoctorName -replace '^(Dr|Mr|Mrs|Miss|Professor|Prof)\.?\s+', ''
    $escapedNameAlt = [regex]::Escape($nameWithoutTitle)
    $patternAlt = "(`"name`":\s*`"[^`"]*$escapedNameAlt[^`"]*`"[^}]*)(})"
    
    if ($content -match $patternAlt) {
        Write-Host "[Blacklist] ✅ Found doctor record with alternative pattern"
        
        if ($content -match "`"name`":\s*`"[^`"]*$escapedNameAlt[^`"]*`"[^}]*`"blacklisted`"") {
            Write-Host "[Blacklist] ⚠️  Record already has blacklist flag, updating..."
            $content = $content -replace "(`"name`":\s*`"[^`"]*$escapedNameAlt[^`"]*`"[^}]*?)`"blacklisted`":\s*[^,}]+", "`$1`"blacklisted`": true"
            $content = $content -replace "(`"name`":\s*`"[^`"]*$escapedNameAlt[^`"]*`"[^}]*?)`"blacklistedDate`":\s*`"[^`"]*`"", "`$1`"blacklistedDate`": `"$(Get-Date -Format 'yyyy-MM-dd')`""
            $content = $content -replace "(`"name`":\s*`"[^`"]*$escapedNameAlt[^`"]*`"[^}]*?)`"blacklistNotes`":\s*`"[^`"]*`"", "`$1`"blacklistNotes`": `"$($Notes -replace '"', '\"')`""
            $content = $content -replace "(`"name`":\s*`"[^`"]*$escapedNameAlt[^`"]*`"[^}]*?)`"blacklistReason`":\s*`"[^`"]*`"", "`$1`"blacklistReason`": `"$($Reason -replace '"', '\"')`""
        } else {
            $blacklistFields = ",`n      `"blacklisted`": true,`n      `"blacklistedDate`": `"$(Get-Date -Format 'yyyy-MM-dd')`",`n      `"blacklistNotes`": `"$($Notes -replace '"', '\"')`",`n      `"blacklistReason`": `"$($Reason -replace '"', '\"')`""
            $content = $content -replace "(`"name`":\s*`"[^`"]*$escapedNameAlt[^`"]*`"[^}]*)(})", "`$1$blacklistFields`$2"
        }
        
        $content | Set-Content $DataFile -Encoding UTF8 -NoNewline
        Write-Host "[Blacklist] ✅ Successfully updated $DataFile"
        exit 0
    } else {
        Write-Host "[Blacklist] ❌ Doctor not found: $DoctorName"
        Write-Host "[Blacklist] Restoring backup..."
        Copy-Item $backupFile $DataFile -Force
        Remove-Item $backupFile
        exit 1
    }
}
