# Run this after closing Cursor/IDE or other git processes (so .git/index.lock is gone)
# Commit everything: restores evaluation, optimization, testing, test files; then add all and commit.

Set-Location $PSScriptRoot

if (Test-Path ".git/index.lock") {
    Remove-Item ".git/index.lock" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# Unstage the deletions so we keep evaluation, optimization, testing, test files
git restore --staged "Local Doctor Ranking/evaluation/" "Local Doctor Ranking/optimization/" "Local Doctor Ranking/parallel-ranking-package/testing/" "Local Doctor Ranking/test-dietitian-search.js" "Local Doctor Ranking/test-dietitians.js" "Local Doctor Ranking/test-display-results.js" "Local Doctor Ranking/test-specialty-filter.js" "Local Doctor Ranking/test-v6-fetching.js" 2>$null

# Add all changes (respects .gitignore)
git add -A

# Commit
git commit -m "Commit everything: UI, server, package, ranking code, recommendation-loop, WhatsApp, evaluation, optimization, tests"

Write-Output "Done. Push with: git push origin master"
