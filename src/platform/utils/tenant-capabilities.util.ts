import { ModuleCode } from '@prisma/client';

export type FeatureFlagOverride = {
  moduleCode: ModuleCode;
  enabled: boolean;
};

const moduleNavigationCatalog: Record<
  ModuleCode,
  {
    label: string;
    icon: string;
    order: number;
    routes: string[];
  }
> = {
  [ModuleCode.ATS]: {
    label: 'Recruitment',
    icon: 'briefcase',
    order: 10,
    routes: ['/jobs', '/candidates', '/applications', '/interviews'],
  },
  [ModuleCode.ONBOARDING]: {
    label: 'Onboarding',
    icon: 'file-check',
    order: 20,
    routes: ['/onboarding', '/documents', '/checklists'],
  },
  [ModuleCode.TRAINING]: {
    label: 'Training',
    icon: 'graduation-cap',
    order: 30,
    routes: ['/training', '/courses', '/evaluations', '/certificates'],
  },
  [ModuleCode.INVENTORY]: {
    label: 'Inventory',
    icon: 'boxes',
    order: 40,
    routes: ['/inventory', '/assets', '/stock-alerts'],
  },
  [ModuleCode.AI_PRODUCTIVITY]: {
    label: 'AI Productivity',
    icon: 'activity',
    order: 50,
    routes: ['/productivity', '/metrics', '/alerts', '/analytics'],
  },
  [ModuleCode.DOCUMENTS]: {
    label: 'Documents',
    icon: 'folder',
    order: 60,
    routes: ['/documents', '/templates', '/signatures'],
  },
  [ModuleCode.REPORTS]: {
    label: 'Reports',
    icon: 'bar-chart-3',
    order: 70,
    routes: ['/reports', '/dashboards'],
  },
};

export function mergeEnabledModules(
  planModules: ModuleCode[],
  featureFlags: FeatureFlagOverride[],
): ModuleCode[] {
  const enabled = new Set<ModuleCode>(planModules);

  for (const featureFlag of featureFlags) {
    if (featureFlag.enabled) {
      enabled.add(featureFlag.moduleCode);
      continue;
    }

    enabled.delete(featureFlag.moduleCode);
  }

  return [...enabled].sort(
    (left, right) => moduleNavigationCatalog[left].order - moduleNavigationCatalog[right].order,
  );
}

export function buildNavigation(enabledModules: ModuleCode[]) {
  return enabledModules.map((moduleCode) => {
    const entry = moduleNavigationCatalog[moduleCode];

    return {
      code: moduleCode,
      label: entry.label,
      icon: entry.icon,
      order: entry.order,
      routes: entry.routes,
    };
  });
}
