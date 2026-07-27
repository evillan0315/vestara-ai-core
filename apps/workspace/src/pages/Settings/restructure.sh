#!/usr/bin/env bash

set -e

echo "========================================"
echo " Vestara Settings Refactor"
echo "========================================"

########################################
# Create new folders
########################################

mkdir -p AI/Providers/{components,hooks,services,api}
mkdir -p AI/Routing/components

mkdir -p Appearance/{Theme,Typography,Layout,Profiles,Preview}

mkdir -p Workspace/{Preferences,Dashboard,Profiles}

mkdir -p shared/components
mkdir -p shared/hooks

echo "✓ Folder structure created"

########################################
# Helper Function
########################################

move() {
    if [ -f "$1" ]; then
        mkdir -p "$(dirname "$2")"
        mv "$1" "$2"
        echo "✓ $1"
    fi
}

########################################
# AI Providers
########################################

move components/providers/ProviderCard.tsx \
AI/Providers/components/ProviderCard.tsx

move components/providers/ProviderMatrix.tsx \
AI/Providers/components/ProviderMatrix.tsx

move components/providers/ProviderConfiguration.tsx \
AI/Providers/components/ProviderConfiguration.tsx

move components/providers/ProviderArchitecture.tsx \
AI/Providers/components/ProviderArchitecture.tsx

move components/providers/ConnectionTester.tsx \
AI/Providers/components/ConnectionTester.tsx

move components/providers/ModelSelector.tsx \
AI/Providers/components/ModelSelector.tsx

move hooks/useProviderHealth.ts \
AI/Providers/hooks/useProviderHealth.ts

move hooks/useConnectionTest.ts \
AI/Providers/hooks/useConnectionTest.ts

move api/providers.api.ts \
AI/Providers/api/providers.api.ts

move services/providerHealth.ts \
AI/Providers/services/providerHealth.ts

move services/connectionTester.ts \
AI/Providers/services/connectionTester.ts

move models/providers.ts \
AI/Providers/models.ts

########################################
# AI Routing
########################################

move components/routing/IntentRouting.tsx \
AI/Routing/components/IntentRouting.tsx

move components/routing/IntentModelRow.tsx \
AI/Routing/components/IntentModelRow.tsx

move models/intentModels.ts \
AI/Routing/models.ts

########################################
# Appearance
########################################

move components/appearance/ThemeSettings.tsx \
Appearance/Theme/ThemeSettings.tsx

move components/appearance/AppearanceMode.tsx \
Appearance/Theme/AppearanceMode.tsx

move components/appearance/AccentSelector.tsx \
Appearance/Theme/AccentSelector.tsx

move components/appearance/TypographySettings.tsx \
Appearance/Typography/TypographySettings.tsx

move components/appearance/LayoutSettings.tsx \
Appearance/Layout/LayoutSettings.tsx

move components/appearance/ProfileSelector.tsx \
Appearance/Profiles/ProfileSelector.tsx

move components/appearance/ThemePreview.tsx \
Appearance/Preview/ThemePreview.tsx

move models/appearance.ts \
Appearance/models.ts

########################################
# Workspace
########################################

move components/preferences/Preferences.tsx \
Workspace/Preferences/Preferences.tsx

move components/preferences/PreferenceToggle.tsx \
Workspace/Preferences/PreferenceToggle.tsx

move components/preferences/ResetSettings.tsx \
Workspace/Preferences/ResetSettings.tsx

move models/preferences.ts \
Workspace/Preferences/models.ts

########################################
# Shared Components
########################################

for file in \
Badge.tsx \
Card.tsx \
NumberInput.tsx \
Select.tsx \
SettingGroup.tsx \
SettingRow.tsx \
TextInput.tsx \
Toggle.tsx
do
    move components/common/$file shared/components/$file
done

move components/layout/Section.tsx \
shared/components/Section.tsx

########################################
# Remove Empty Directories
########################################

find components -type d -empty -delete || true
find hooks -type d -empty -delete || true
find services -type d -empty -delete || true
find api -type d -empty -delete || true
find models -type d -empty -delete || true

echo
echo "========================================"
echo " Settings folder reorganized successfully"
echo "========================================"