#!/usr/bin/env bash

set -e

BASE="./src/pages/Settings"

echo "Creating Settings module..."

mkdir -p \
"$BASE/hooks" \
"$BASE/api" \
"$BASE/context" \
"$BASE/services" \
"$BASE/models" \
"$BASE/assets/provider-icons" \
"$BASE/components/layout" \
"$BASE/components/providers" \
"$BASE/components/routing" \
"$BASE/components/appearance" \
"$BASE/components/preferences" \
"$BASE/components/charts" \
"$BASE/components/common"

touch \
"$BASE/index.tsx" \
"$BASE/SettingsPage.tsx" \
"$BASE/constants.ts" \
"$BASE/types.ts" \
"$BASE/utils.ts" \
"$BASE/README.md"

touch \
"$BASE/hooks/index.ts" \
"$BASE/hooks/useSettings.ts" \
"$BASE/hooks/useProviderHealth.ts" \
"$BASE/hooks/useConnectionTest.ts" \
"$BASE/hooks/useThemeSettings.ts"

touch \
"$BASE/api/index.ts" \
"$BASE/api/settings.api.ts" \
"$BASE/api/providers.api.ts"

touch \
"$BASE/context/SettingsContext.tsx"

touch \
"$BASE/services/providerHealth.ts" \
"$BASE/services/connectionTester.ts" \
"$BASE/services/settingsStorage.ts"

touch \
"$BASE/models/providers.ts" \
"$BASE/models/intentModels.ts" \
"$BASE/models/appearance.ts" \
"$BASE/models/preferences.ts"

touch \
"$BASE/components/layout/index.ts" \
"$BASE/components/layout/Section.tsx" \
"$BASE/components/layout/SettingsHeader.tsx" \
"$BASE/components/layout/StatusBanner.tsx" \
"$BASE/components/layout/SettingsGrid.tsx"

touch \
"$BASE/components/providers/index.ts" \
"$BASE/components/providers/ProviderMatrix.tsx" \
"$BASE/components/providers/ProviderCard.tsx" \
"$BASE/components/providers/ProviderConfiguration.tsx" \
"$BASE/components/providers/ProviderArchitecture.tsx" \
"$BASE/components/providers/ConnectionTester.tsx" \
"$BASE/components/providers/ModelSelector.tsx"

touch \
"$BASE/components/routing/index.ts" \
"$BASE/components/routing/IntentRouting.tsx" \
"$BASE/components/routing/IntentModelRow.tsx"

touch \
"$BASE/components/appearance/index.ts" \
"$BASE/components/appearance/ThemeSettings.tsx" \
"$BASE/components/appearance/TypographySettings.tsx" \
"$BASE/components/appearance/LayoutSettings.tsx" \
"$BASE/components/appearance/AccentSelector.tsx" \
"$BASE/components/appearance/ProfileSelector.tsx" \
"$BASE/components/appearance/ThemePreview.tsx" \
"$BASE/components/appearance/AppearanceMode.tsx"

touch \
"$BASE/components/preferences/index.ts" \
"$BASE/components/preferences/Preferences.tsx" \
"$BASE/components/preferences/PreferenceToggle.tsx" \
"$BASE/components/preferences/ResetSettings.tsx"

touch \
"$BASE/components/charts/index.ts" \
"$BASE/components/charts/ProviderHealthChart.tsx"

touch \
"$BASE/components/common/index.ts" \
"$BASE/components/common/SettingRow.tsx" \
"$BASE/components/common/SettingGroup.tsx" \
"$BASE/components/common/Toggle.tsx" \
"$BASE/components/common/Select.tsx" \
"$BASE/components/common/TextInput.tsx" \
"$BASE/components/common/NumberInput.tsx" \
"$BASE/components/common/Card.tsx" \
"$BASE/components/common/Badge.tsx"

echo ""
echo "✅ Settings module created!"
echo ""

find "$BASE" | sort
