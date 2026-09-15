/**
 * useBreadcrumbs — Global breadcrumb resolver.
 *
 * Resolves `location.pathname` → breadcrumb trail using:
 * 1. APP_ROUTES (path → title)
 * 2. WORKSPACE_NAVIGATION (path → label/group/icon, group → System/Intelligence etc.)
 * 3. SETTINGS_SECTIONS (leaf tabs under /settings)
 *
 * Intelligence routes are first-class: /intelligence/memory → Intelligence / Knowledge
 * Legacy paths (/memory, /graph, /routing) still resolve via their own entries but
 * canonical breadcrumbs prefer the Intelligence group when pathname starts with /intelligence.
 *
 * Tabs: detects Settings sub-sections (e.g. /settings/general → Settings / General)
 * and system→settings chain (group 'system' → Settings).
 */

import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { APP_ROUTES } from '../../../routes';
import { SETTINGS_SECTIONS, settingsGroupLabel } from '../../../pages/Settings/settings-navigation';
import { WORKSPACE_NAVIGATION } from '../../../layouts/workspace-navigation';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  isCurrent: boolean;
}

function findNavByPath(path: string) {
  // longest prefix wins (handles /settings/*, /intelligence/memory etc.)
  let best: (typeof WORKSPACE_NAVIGATION)[number] | undefined;
  let bestLen = -1;
  for (const entry of WORKSPACE_NAVIGATION) {
    if (!entry.path) continue;
    if (path === entry.path || path.startsWith(`${entry.path}/`) || path.startsWith(`${entry.path}?`)) {
      if (entry.path.length > bestLen) {
        best = entry;
        bestLen = entry.path.length;
      }
    }
    // also handle wildcard /settings/* style: entry.path without wildcard
    if (entry.path.endsWith('/*')) {
      const base = entry.path.slice(0, -2);
      if (path === base || path.startsWith(`${base}/`)) {
        if (base.length > bestLen) {
          best = entry;
          bestLen = base.length;
        }
      }
    }
  }
  return best;
}

function findRouteByPath(path: string) {
  // exact or prefix with params
  const clean = path.split('?')[0].split('#')[0];
  for (const route of APP_ROUTES) {
    const pattern = route.path.replace(/\/\*$/, '').replace(/\/:.*$/, '');
    if (clean === route.path || clean === pattern || clean.startsWith(`${pattern}/`)) {
      // prefer longest
      return route;
    }
  }
  return undefined;
}

export function buildBreadcrumbs(pathname: string, search?: string): BreadcrumbItem[] {
  const cleanPath = pathname.split('?')[0].split('#')[0] || '/';
  const searchParams = new URLSearchParams(search ?? '');
  // Never show breadcrumbs on public/catch-all
  if (cleanPath === '/login' || cleanPath === '/') return [];

  const crumbs: BreadcrumbItem[] = [];

  // Special: Settings hierarchy — system → Settings → [Group] → Section → Sub-tab
  // Tabs inside tabs: e.g. /settings/general, /settings/providers, /settings/assistant-execution
  // We resolve via SETTINGS_SECTIONS so any click on a Settings tab updates the trail live (useLocation).
  if (cleanPath.startsWith('/settings')) {
    crumbs.push({ label: 'System', href: undefined, isCurrent: false });
    crumbs.push({ label: 'Settings', href: '/settings', isCurrent: false });
    const parts = cleanPath.replace(/^\/settings\/?/, '').split('/').filter(Boolean);
    const sectionId = parts[0];
    const subPath = parts[1];
    if (!sectionId || sectionId === 'overview') {
      crumbs[crumbs.length - 1].isCurrent = true;
      crumbs.forEach((c, i) => (c.isCurrent = i === crumbs.length - 1));
      return crumbs;
    }
    const section = SETTINGS_SECTIONS.find((s) => s.id === sectionId);
    if (section) {
      // Insert group as intermediate crumb for tabs-inside-tabs clarity (e.g. Runtime & AI)
      const groupLabel = settingsGroupLabel(section.group);
      // Only show group if not 'workspace' to avoid noise on Overview/General, but still for runtime-ai/engineering
      if (groupLabel && groupLabel !== 'Workspace') {
        crumbs.push({ label: groupLabel, href: undefined, isCurrent: false });
      }
      const isGeneral = sectionId === 'general';
      // For tabs-inside-tabs (General → Typography/Layout) and subPath routes
      const hasInnerTab = isGeneral && searchParams.get('tab') && searchParams.get('tab') !== 'profiles';
      crumbs.push({ label: section.label, href: `/settings/${section.id}`, isCurrent: !subPath && !hasInnerTab });
      if (subPath) {
        crumbs[crumbs.length - 1].isCurrent = false;
        crumbs.push({ label: subPath, href: cleanPath, isCurrent: !hasInnerTab });
      }
      if (hasInnerTab) {
        const tabId = searchParams.get('tab')!;
        const tabLabels: Record<string, string> = {
          appearance: 'Appearance',
          typography: 'Typography',
          layout: 'Layout',
          profiles: 'Profiles',
        };
        const tabLabel = tabLabels[tabId] ?? tabId;
        crumbs[crumbs.length - 1].isCurrent = false;
        crumbs.push({ label: tabLabel, href: `${cleanPath}?tab=${tabId}`, isCurrent: true });
      }
    } else if (sectionId) {
      crumbs.push({ label: sectionId, href: `/settings/${sectionId}`, isCurrent: !subPath });
      if (subPath) crumbs.push({ label: subPath, href: cleanPath, isCurrent: true });
    }
    crumbs.forEach((c, i) => (c.isCurrent = i === crumbs.length - 1));
    return crumbs;
  }

  // Intelligence grouping: /intelligence/* → Intelligence / <leaf> / <tab>
  // Tabs inside tabs: e.g. /intelligence/memory?tab=typography
  if (cleanPath.startsWith('/intelligence')) {
    crumbs.push({ label: 'Intelligence', href: '/intelligence', isCurrent: cleanPath === '/intelligence' && !searchParams.get('tab') });
    const parts = cleanPath.replace(/^\/intelligence\/?/, '').split('/').filter(Boolean);
    const leaf = parts[0];
    const sub = parts[1];
    const tabParam = searchParams.get('tab');
    const hasTab = Boolean(tabParam && tabParam !== 'overview');
    if (leaf) {
      const nav = findNavByPath(`/intelligence/${leaf}`);
      const label = nav?.label ?? leaf;
      crumbs.push({ label, href: `/intelligence/${leaf}`, isCurrent: !sub && !hasTab });
      crumbs[0].isCurrent = false;
      if (sub) {
        crumbs[crumbs.length - 1].isCurrent = false;
        crumbs.push({ label: sub, href: cleanPath, isCurrent: !hasTab });
      }
      if (hasTab) {
        const tabLabels: Record<string, string> = {
          typography: 'Typography',
          layout: 'Layout',
          appearance: 'Appearance',
          profiles: 'Profiles',
          overview: 'Overview',
        };
        const tabLabel = tabLabels[tabParam!] ?? tabParam!;
        crumbs[crumbs.length - 1].isCurrent = false;
        crumbs.push({ label: tabLabel, href: `${cleanPath}?tab=${tabParam}`, isCurrent: true });
      }
    } else if (hasTab) {
      const tabParam2 = searchParams.get('tab')!;
      crumbs[0].isCurrent = false;
      crumbs.push({ label: tabParam2, href: `${cleanPath}?tab=${tabParam2}`, isCurrent: true });
    } else {
      crumbs[0].isCurrent = true;
    }
    return crumbs;
  }

  // Generic workspace navigation: resolve via WORKSPACE_NAVIGATION
  const nav = findNavByPath(cleanPath);
  if (nav) {
    // If nav has group, we don't push group as crumb (keeps breadcrumbs short),
    // but for system/intelligence we already handled. For others, just nav label.
    // For nested like /opencode/sessions/:id, build parent chain
    const basePath = nav.path?.replace(/\/\*$/, '') ?? nav.path;
    if (basePath && basePath !== cleanPath) {
      // parent crumb
      crumbs.push({ label: nav.label, href: basePath, isCurrent: false });
      // leaf: try route title or last segment
      const route = findRouteByPath(cleanPath);
      const leafLabel = route?.title ?? cleanPath.split('/').filter(Boolean).pop() ?? nav.label;
      // avoid duplicate if same as parent
      if (leafLabel !== nav.label) {
        crumbs.push({ label: leafLabel, href: cleanPath, isCurrent: true });
      } else {
        crumbs[0].isCurrent = true;
      }
    } else {
      crumbs.push({ label: nav.label, href: nav.path, isCurrent: true });
    }
    return crumbs;
  }

  // Fallback: use APP_ROUTES title
  const route = findRouteByPath(cleanPath);
  if (route) {
    crumbs.push({ label: route.title, href: route.path, isCurrent: true });
    return crumbs;
  }

  // last resort: split path
  const parts = cleanPath.split('/').filter(Boolean);
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    acc += `/${parts[i]}`;
    crumbs.push({ label: parts[i], href: acc, isCurrent: i === parts.length - 1 });
  }
  return crumbs;
}

export function useBreadcrumbs(): BreadcrumbItem[] {
  const location = useLocation();
  return useMemo(() => buildBreadcrumbs(location.pathname, location.search), [location.pathname, location.search]);
}
