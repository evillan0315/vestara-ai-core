#!/usr/bin/env bash

set -e

BASE_DIR="src/components/layout"

echo "Creating layout component structure..."

mkdir -p \
  "$BASE_DIR/AppSidebar" \
  "$BASE_DIR/AppHeader" \
  "$BASE_DIR/Page" \
  "$BASE_DIR/CommandPalette"

create_component() {
  local file="$1"
  local component="$2"

cat > "$file" <<EOF
import type { FC } from "react";

const ${component}: FC = () => {
  return (
    <div>
      ${component}
    </div>
  );
};

export default ${component};
EOF

echo "✓ Created $file"
}

# ------------------------------------------------------------------
# AppSidebar
# ------------------------------------------------------------------

create_component "$BASE_DIR/AppSidebar/AppSidebar.tsx" "AppSidebar"
create_component "$BASE_DIR/AppSidebar/SidebarBrand.tsx" "SidebarBrand"
create_component "$BASE_DIR/AppSidebar/SidebarNavigation.tsx" "SidebarNavigation"
create_component "$BASE_DIR/AppSidebar/SidebarSection.tsx" "SidebarSection"
create_component "$BASE_DIR/AppSidebar/SidebarWorkspace.tsx" "SidebarWorkspace"
create_component "$BASE_DIR/AppSidebar/SidebarUser.tsx" "SidebarUser"
create_component "$BASE_DIR/AppSidebar/SidebarFooter.tsx" "SidebarFooter"

# ------------------------------------------------------------------
# AppHeader
# ------------------------------------------------------------------

create_component "$BASE_DIR/AppHeader/AppHeader.tsx" "AppHeader"
create_component "$BASE_DIR/AppHeader/HeaderSearch.tsx" "HeaderSearch"
create_component "$BASE_DIR/AppHeader/HeaderActions.tsx" "HeaderActions"
create_component "$BASE_DIR/AppHeader/HeaderNotifications.tsx" "HeaderNotifications"
create_component "$BASE_DIR/AppHeader/HeaderConnection.tsx" "HeaderConnection"
create_component "$BASE_DIR/AppHeader/HeaderUserMenu.tsx" "HeaderUserMenu"

# ------------------------------------------------------------------
# Page
# ------------------------------------------------------------------

create_component "$BASE_DIR/Page/PageContainer.tsx" "PageContainer"
create_component "$BASE_DIR/Page/PageHeader.tsx" "PageHeader"
create_component "$BASE_DIR/Page/PageBreadcrumb.tsx" "PageBreadcrumb"

# ------------------------------------------------------------------
# CommandPalette
# ------------------------------------------------------------------

create_component "$BASE_DIR/CommandPalette/CommandPalette.tsx" "CommandPalette"

echo ""
echo "✅ Layout component structure created successfully."