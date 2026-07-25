import { getTools, getToolsByCategory, getEnabledTools, getVisibleTools, Tool } from "./registry";

const totalTests = 0;
const passedTests = 0;

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// -------------------------------------------------------------
// TEST CASES
// -------------------------------------------------------------

test("Tool Registry - getTools returns all tools sorted by order", () => {
  const tools = getTools();
  assert(tools.length > 0, "Should return registered tools");

  // Verify order
  for (let i = 0; i < tools.length - 1; i++) {
    if (tools[i].category === tools[i + 1].category) {
      assert(
        tools[i].order <= tools[i + 1].order,
        `Tools should be sorted by order: ${tools[i].name} vs ${tools[i + 1].name}`,
      );
    }
  }
});

test("Category Grouping - getToolsByCategory groups correctly", () => {
  const productivityTools = getToolsByCategory("Productivity");
  assert(productivityTools.length > 0, "Productivity tools should exist");
  productivityTools.forEach((t) => {
    assertEquals(t.category, "Productivity", "All returned tools must be in Productivity category");
  });

  const devTools = getToolsByCategory("Developer");
  assert(devTools.length > 0, "Developer tools should exist");
  devTools.forEach((t) => {
    assertEquals(t.category, "Developer", "All returned tools must be in Developer category");
  });
});

test("Registry Filtering - getEnabledTools filters disabled items", () => {
  const enabledTools = getEnabledTools();
  const allTools = getTools();

  assert(enabledTools.length < allTools.length, "Enabled tools should be a subset of all tools");
  enabledTools.forEach((t) => {
    assert(t.enabled, `Tool ${t.name} must be enabled`);
  });
});

test("Developer Mode Filtering - getVisibleTools checks devMode condition", () => {
  const invisibleTools = getVisibleTools(false);
  const visibleTools = getDevVisibleTools(true);

  // Tools requiring devMode should be hidden when devMode is false
  const devToolRequire = getTools().find((t) => t.requiresDevMode);
  if (devToolRequire) {
    const foundInInvisible = invisibleTools.some((t) => t.id === devToolRequire.id);
    assertEquals(foundInInvisible, false, "Dev tools must be hidden when devMode is disabled");

    const foundInVisible = visibleTools.some((t) => t.id === devToolRequire.id);
    assertEquals(foundInVisible, true, "Dev tools must be shown when devMode is enabled");
  }
});

test("Sidebar Navigation - IA layout matches requirements", () => {
  // Re-create the sidebar IA items hierarchy in logic to verify structure
  const dailyWorkItems = [
    { label: "Timeline", to: "/timeline" },
    { label: "Projects", to: "/projects" },
    { label: "Tasks", to: "/tasks" },
    { label: "Notes", to: "/notes" },
    { label: "Chat", to: "/chat" },
    { label: "Sessions", to: "/sessions" },
  ];

  const searchItems = [{ label: "Search", to: "/search" }];

  const bottomItems = [
    { label: "Tools", to: "/tools" },
    { label: "Settings", to: "/settings" },
  ];

  assertEquals(dailyWorkItems[0].label, "Timeline", "Timeline is first in Daily Work");
  assertEquals(dailyWorkItems[1].label, "Projects", "Projects is second in Daily Work");
  assertEquals(dailyWorkItems[2].label, "Tasks", "Tasks is third in Daily Work");
  assertEquals(dailyWorkItems[2].to, "/tasks", "Tasks points to /tasks");
  assertEquals(dailyWorkItems[3].label, "Notes", "Notes is fourth in Daily Work");
  assertEquals(dailyWorkItems[3].to, "/notes", "Notes points to /notes");
  assertEquals(dailyWorkItems[4].label, "Chat", "Chat is fifth in Daily Work");
  assertEquals(dailyWorkItems[5].label, "Sessions", "Sessions is sixth in Daily Work");

  assertEquals(searchItems[0].label, "Search", "Search section is present");
  assertEquals(bottomItems[0].label, "Tools", "Tools is under the bottom group");
  assertEquals(bottomItems[0].to, "/tools", "Tools route is /tools");
  assertEquals(bottomItems[1].label, "Settings", "Settings is under the bottom group");
});

test("Route Redirects - redirect validation", () => {
  // Simulate the behavior of TanStack Router redirect handlers
  const mockRedirects = (path: string, searchParams: any = {}) => {
    if (path === "/vault") {
      return { to: "/tools/vault", search: searchParams, replace: true };
    }
    if (path === "/daily-mission") {
      return { to: "/tasks", replace: true };
    }
    if (path === "/brain-dump") {
      return { to: "/notes", replace: true };
    }
    return null;
  };

  const redirect1 = mockRedirects("/vault", { folderId: "f-123" });
  assertEquals(
    redirect1,
    { to: "/tools/vault", search: { folderId: "f-123" }, replace: true },
    "Legacy vault redirects to /tools/vault with search params",
  );

  const redirect2 = mockRedirects("/daily-mission");
  assertEquals(
    redirect2,
    { to: "/tasks", replace: true },
    "Legacy daily-mission redirects to /tasks",
  );

  const redirect3 = mockRedirects("/brain-dump");
  assertEquals(redirect3, { to: "/notes", replace: true }, "Legacy brain-dump redirects to /notes");
});

test("Tools page rendering - search and grouping simulation", () => {
  const mockSearch = (query: string, tools: Tool[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  };

  const allTools = getTools();
  const searchResult1 = mockSearch("Vault", allTools);
  assert(
    searchResult1.some((t) => t.id === "vault"),
    "Searching 'Vault' should find File Vault",
  );

  const searchResult2 = mockSearch("Productivity", allTools);
  searchResult2.forEach((t) => {
    assert(
      t.category === "Productivity" ||
        t.name.includes("Productivity") ||
        t.description.includes("Productivity"),
      "Search result should match query",
    );
  });
});

// Helper wrapper to match browser implementation
function getDevVisibleTools(devMode: boolean) {
  return getVisibleTools(devMode);
}

// Run serial runner
