#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Phyzelyne — Nav patch: replaces AI tab with Business tab in all pages
# Run from your project root:  bash patch_nav.sh
# ─────────────────────────────────────────────────────────────────────

set -e

FILES=(
  "dashboard.html"
  "transactions.html"
  "analysis.html"
  "settings.html"
  "login.html"
  "signup.html"
  "pricing.html"
  "invoices.html"
  "onboarding.html"
)

OLD_NAV='<a href="ai.html" class="bottom-nav-item" data-page="ai"><i class="fas fa-brain"><\/i>AI<\/a>'
NEW_NAV='<a href="business.html" class="bottom-nav-item" data-page="business"><i class="fas fa-briefcase"><\/i>Business<\/a>'

OLD_SIDEBAR='href="ai.html"'
NEW_SIDEBAR='href="business.html"'

OLD_DATAPAGE='data-page="ai"'
NEW_DATAPAGE='data-page="business"'

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    # Create backup
    cp "$file" "${file}.bak"

    # Run all three replacements
    sed -i \
      -e "s|${OLD_NAV}|${NEW_NAV}|g" \
      -e "s|${OLD_SIDEBAR}|${NEW_SIDEBAR}|g" \
      -e "s|${OLD_DATAPAGE}|${NEW_DATAPAGE}|g" \
      "$file"

    echo "✓  Patched: $file  (backup: ${file}.bak)"
  else
    echo "⚠  Skipped (not found): $file"
  fi
done

echo ""
echo "Done! All .bak files are your originals if you need to roll back."
