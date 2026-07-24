import React, { type ReactNode } from "react";
import {
  Folder,
  BarChart3,
  Brain,
  Zap,
  Hammer,
  RefreshCw,
  HeartPulse,
  Terminal,
} from "lucide-react";

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any> | ReactNode;
  route: string;
  category: "Productivity" | "Knowledge" | "Automation" | "System" | "Developer";
  status: "ready" | "coming-soon" | "experimental";
  enabled: boolean;
  requiresDevMode?: boolean;
  order: number;
}

export const toolsRegistry: Tool[] = [
  {
    id: "vault",
    name: "File Vault",
    description: "Secure local file vault with metadata tagging and preview capabilities.",
    icon: Folder,
    route: "/tools/vault",
    category: "Productivity",
    status: "ready",
    enabled: true,
    order: 1,
  },
  {
    id: "analytics",
    name: "Analytics",
    description: "Visualize focus sessions, task completion, and growth trends over time.",
    icon: BarChart3,
    route: "/tools/analytics",
    category: "Productivity",
    status: "coming-soon",
    enabled: false,
    order: 2,
  },
  {
    id: "genesis",
    name: "GENESIS",
    description: "AI core engine orchestrator, memory hub, and personality matrix generator.",
    icon: Brain,
    route: "/tools/genesis",
    category: "Knowledge",
    status: "coming-soon",
    enabled: false,
    order: 1,
  },
  {
    id: "titan",
    name: "TITAN",
    description: "High-performance data processor, scheduler, and background worker manager.",
    icon: Zap,
    route: "/tools/titan",
    category: "Automation",
    status: "coming-soon",
    enabled: false,
    order: 1,
  },
  {
    id: "forge",
    name: "FORGE",
    description: "Automated code construction, script compiler, and local execution sandbox.",
    icon: Hammer,
    route: "/tools/forge",
    category: "Automation",
    status: "coming-soon",
    enabled: false,
    order: 2,
  },
  {
    id: "migration",
    name: "Migration Hub",
    description: "Database schema verification, backup recovery, and migration controller.",
    icon: RefreshCw,
    route: "/tools/migration",
    category: "System",
    status: "coming-soon",
    enabled: false,
    order: 1,
  },
  {
    id: "diagnostics",
    name: "Diagnostics",
    description: "Evaluate system state, check storage health, and run subsystem self-tests.",
    icon: HeartPulse,
    route: "/tools/diagnostics",
    category: "System",
    status: "experimental",
    enabled: true,
    order: 2,
  },
  {
    id: "dev-tools",
    name: "Developer Tools",
    description: "Inspector dashboard, environment variable editor, and raw database client.",
    icon: Terminal,
    route: "/brain",
    category: "Developer",
    status: "experimental",
    enabled: true,
    requiresDevMode: true,
    order: 1,
  },
];

// Helper Functions
export function getTools(): Tool[] {
  return [...toolsRegistry].sort((a, b) => a.order - b.order);
}

export function getEnabledTools(): Tool[] {
  return getTools().filter((t) => t.enabled);
}

export function getToolsByCategory(category: Tool["category"]): Tool[] {
  return getTools().filter((t) => t.category === category);
}

export function getVisibleTools(isDevModeEnabled: boolean): Tool[] {
  return getTools().filter((t) => {
    if (t.requiresDevMode && !isDevModeEnabled) {
      return false;
    }
    return true;
  });
}
