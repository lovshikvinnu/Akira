import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Sparkles,
  RotateCcw,
  Palette,
  User,
  Info,
  Tag,
  Terminal,
  Cpu,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Shell, PageHeader } from "@/app/shell/Shell";
import { CardShell, CardLabel, FieldInput, GhostButton } from "@/app/ui/primitives";
import { ConfirmDialog } from "@/app/ui/dialogs/ConfirmDialog";
import { useAkira, akira } from "@/akira-os";
import { useAIProviderManager, aiProviderManager } from "@/genesis";

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => {
    return {
      tab: typeof search.tab === "string" ? search.tab : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Settings — AKIRA" },
      { name: "description", content: "Personalize AKIRA, manage data, and review the build." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const profile = useAkira((s) => s.profile);
  const [name, setName] = useState(profile.name);
  const [role, setRole] = useState(profile.role);
  const [motto, setMotto] = useState(profile.motto);
  const [resetOpen, setResetOpen] = useState(false);
  const [devMode, setDevMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("akira:dev_mode") === "true";
  });

  const search = Route.useSearch();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() =>
    search.tab === "providers" ? "providers" : "general",
  );

  const providerState = useAIProviderManager();
  const [selectedProvider, setSelectedProvider] = useState(() =>
    aiProviderManager.getActiveProviderName(),
  );
  const [apiKeyInput, setApiKeyInput] = useState(() =>
    aiProviderManager.getApiKey(selectedProvider),
  );
  const [modelInput, setModelInput] = useState(() => aiProviderManager.getModel(selectedProvider));
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Sync apiKeyInput and modelInput when the provider changes, or when the
  // manager's own key or model values change -- hydration landing after the
  // first render is the case that matters. The model was missing from these
  // dependencies, so a model arriving from storage never reached the field.
  useEffect(() => {
    setApiKeyInput(aiProviderManager.getApiKey(selectedProvider));
    setModelInput(aiProviderManager.getModel(selectedProvider));
    setTestResult(null);
    setShowKey(false);
  }, [
    selectedProvider,
    providerState.geminiKey,
    providerState.openRouterKey,
    providerState.geminiMetrics.model,
    providerState.openRouterMetrics.model,
  ]);

  const handleTabChange = (tab: "general" | "providers") => {
    setActiveTab(tab);
    navigate({ to: "/settings", search: { tab } });
  };

  const handleToggleDevMode = () => {
    const nextVal = !devMode;
    setDevMode(nextVal);
    localStorage.setItem("akira:dev_mode", String(nextVal));
    window.dispatchEvent(new Event("akira:dev_mode_change"));
    if (nextVal) {
      toast.success("Developer Mode enabled. Brain Inspector is now active.");
    } else {
      toast.info("Developer Mode disabled.");
    }
  };

  const handleRemoveKey = async () => {
    const removed = await aiProviderManager.removeApiKey(selectedProvider);
    setApiKeyInput("");
    setTestResult(null);
    if (removed) {
      toast.success(`${selectedProvider} API key removed`);
    } else {
      toast.error(
        `Could not save the removal of the ${selectedProvider} API key. It will return on refresh.`,
      );
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await aiProviderManager.testConnection(selectedProvider, apiKeyInput);
      setTestResult(res);
      if (res.success) {
        toast.success("Connection test succeeded!");
      } else {
        toast.error("Connection test failed.");
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setTestResult({
        success: false,
        message: `Connection error: ${errMsg}`,
      });
      toast.error("Connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  const dirty = name !== profile.name || role !== profile.role || motto !== profile.motto;

  return (
    <Shell>
      <PageHeader
        eyebrow="AKIRA · SETTINGS"
        title="Settings"
        subtitle="Tune AKIRA to feel like yours."
      />

      {/* Tab Navigation */}
      <div className="mt-6 flex border-b border-white/10">
        <button
          onClick={() => handleTabChange("general")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all ${
            activeTab === "general"
              ? "border-violet text-white"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <User className="h-4 w-4" /> General Settings
        </button>
        <button
          onClick={() => handleTabChange("providers")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all ${
            activeTab === "providers"
              ? "border-violet text-white"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Cpu className="h-4 w-4" /> AI Providers
        </button>
      </div>

      {activeTab === "general" ? (
        <section className="mt-8 grid grid-cols-12 gap-5 animate-fade-in">
          <CardShell className="col-span-12 lg:col-span-7">
            <CardLabel accent="violet">
              <span className="inline-flex items-center gap-2">
                <User className="h-3.5 w-3.5" /> Profile
              </span>
            </CardLabel>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                akira.updateProfile({ name, role, motto });
                toast.success("Profile saved");
              }}
              className="mt-5 space-y-4"
            >
              <FieldInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <FieldInput label="Role" value={role} onChange={(e) => setRole(e.target.value)} />
              <FieldInput
                label="Motto"
                value={motto}
                onChange={(e) => setMotto(e.target.value)}
                placeholder="What are you building?"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!dirty}
                  className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Save profile
                </button>
              </div>
            </form>
          </CardShell>

          <CardShell className="col-span-12 lg:col-span-5">
            <CardLabel accent="electric">
              <span className="inline-flex items-center gap-2">
                <Palette className="h-3.5 w-3.5" /> Theme
              </span>
            </CardLabel>
            <p className="mt-4 text-sm text-muted-foreground">
              AKIRA ships dark-first. Light mode and accent variations land in v1.0.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { name: "Midnight", from: "from-violet", to: "to-electric", active: true },
                { name: "Aurora", from: "from-electric", to: "to-cyan-glow" },
                { name: "Solstice", from: "from-violet", to: "to-cyan-glow" },
              ].map((t) => (
                <button
                  key={t.name}
                  onClick={() => toast(`${t.name} theme coming soon`)}
                  className={`group rounded-2xl border bg-white/[0.025] p-3 text-left transition-all hover:-translate-y-[2px] ${
                    t.active ? "border-violet/40" : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <div
                    className={`h-14 rounded-xl bg-gradient-to-br ${t.from} ${t.to} opacity-90`}
                  />
                  <div className="mt-2 text-xs font-medium">{t.name}</div>
                  {t.active && <div className="text-[10px] text-cyan-glow">active</div>}
                </button>
              ))}
            </div>
          </CardShell>

          <CardShell className="col-span-12 lg:col-span-7">
            <CardLabel accent="cyan">
              <span className="inline-flex items-center gap-2">
                <Info className="h-3.5 w-3.5" /> About AKIRA
              </span>
            </CardLabel>
            <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
              AKIRA is your AI Companion for Growth — a futuristic operating system for daily
              missions, projects, brain dump and consistency. Currently in alpha, powered by a local
              service layer.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              <Info2 icon={<Tag className="h-3.5 w-3.5" />} label="Version" value="2.15.1 · Core" />
              <Info2
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Build"
                value="AI Provider Manager"
              />
              <Info2 icon={<User className="h-3.5 w-3.5" />} label="Maker" value="Lovshik" />
            </div>
          </CardShell>

          <CardShell className="col-span-12 lg:col-span-5">
            <CardLabel accent="cyan">
              <span className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5" /> Developer Settings
              </span>
            </CardLabel>
            <p className="mt-4 text-sm text-muted-foreground">
              Enables internal pipeline debugger utilities and the Brain Inspector console.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={handleToggleDevMode}
                className={`inline-flex items-center gap-2 rounded-[14px] border px-4 py-2 text-sm font-medium transition-colors ${
                  devMode
                    ? "border-cyan-glow/40 bg-cyan-glow/10 text-cyan-glow hover:bg-cyan-glow/20"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                }`}
              >
                {devMode ? "Disable Dev Mode" : "Enable Dev Mode"}
              </button>
              {devMode && (
                <Link
                  to="/brain"
                  className="btn-glow inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
                >
                  Launch Brain Inspector
                </Link>
              )}
            </div>
          </CardShell>

          <CardShell className="col-span-12 lg:col-span-5">
            <CardLabel accent="violet">Data</CardLabel>
            <p className="mt-4 text-sm text-muted-foreground">
              All data lives in your browser. Resetting clears projects, missions, notes and chat.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <GhostButton
                onClick={() => {
                  const blob = new Blob([JSON.stringify(akira.getState(), null, 2)], {
                    type: "application/json",
                  });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "akira-data.json";
                  a.click();
                  URL.revokeObjectURL(a.href);
                  toast.success("Data exported");
                }}
              >
                Export JSON
              </GhostButton>
              <button
                onClick={() => setResetOpen(true)}
                className="inline-flex items-center gap-2 rounded-[14px] border border-destructive/40 bg-destructive/15 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-destructive/25"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset local data
              </button>
            </div>
          </CardShell>
        </section>
      ) : (
        <section className="mt-8 grid grid-cols-12 gap-5 animate-fade-in">
          {/* Provider Selection Card */}
          <CardShell className="col-span-12 lg:col-span-5">
            <CardLabel accent="violet">Select Provider</CardLabel>
            <div className="mt-5 space-y-2.5">
              {[
                {
                  name: "Gemini",
                  logo: "G",
                  desc: "Google Gemini Flash 2.5",
                  enabled: true,
                },
                { name: "OpenAI", logo: "O", desc: "GPT model endpoints", enabled: false },
                { name: "Claude", logo: "C", desc: "Anthropic Claude models", enabled: false },
                { name: "Ollama", logo: "OL", desc: "Local Ollama models", enabled: false },
                { name: "LM Studio", logo: "LM", desc: "Local LM Studio host", enabled: false },
                {
                  name: "OpenRouter",
                  logo: "OR",
                  desc: "Aggregated APIs (Nvidia Nemotron)",
                  enabled: true,
                },
              ].map((p) => {
                const active = selectedProvider === p.name;
                const isActiveInStore = providerState.activeProvider === p.name;
                return (
                  <button
                    key={p.name}
                    onClick={() => setSelectedProvider(p.name)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                      active
                        ? "border-violet/60 bg-violet/5 shadow-[0_4px_20px_oklch(0.68_0.22_295_/_0.1)]"
                        : "border-white/5 bg-white/[0.015] hover:border-white/10 hover:bg-white/[0.03]"
                    }`}
                  >
                    <div
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg font-mono text-sm font-bold ${
                        p.enabled
                          ? "bg-cyan-glow/10 text-cyan-glow"
                          : "bg-white/[0.03] text-muted-foreground"
                      }`}
                    >
                      {p.logo}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{p.name}</span>
                        {p.enabled && isActiveInStore && (
                          <span className="rounded-full bg-cyan-glow/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-glow uppercase tracking-wider">
                            Active
                          </span>
                        )}
                        {!p.enabled && (
                          <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                            Soon
                          </span>
                        )}
                      </div>
                      <span className="block text-xs text-muted-foreground mt-0.5">{p.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardShell>

          {/* Config Details Column */}
          <div className="col-span-12 lg:col-span-7">
            {selectedProvider !== "Gemini" && selectedProvider !== "OpenRouter" ? (
              <CardShell>
                <CardLabel accent="electric">{selectedProvider}</CardLabel>
                <div className="mt-8 flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.03] text-muted-foreground/60 border border-white/5 mb-4">
                    <Cpu className="h-6 w-6 animate-pulse" strokeWidth={1.5} />
                  </span>
                  <h3 className="font-display text-sm font-semibold text-white">
                    {selectedProvider} Integration Coming Soon
                  </h3>
                  <p className="mt-2 max-w-sm text-xs text-muted-foreground leading-normal">
                    AKIRA will support {selectedProvider} API and model endpoints in an upcoming
                    release. Currently, only Google Gemini and OpenRouter cognitive services are
                    fully operational.
                  </p>
                </div>
              </CardShell>
            ) : (
              <CardShell>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                  <CardLabel accent="cyan">{selectedProvider} Configuration</CardLabel>
                  <StatusBadge
                    status={
                      selectedProvider === "OpenRouter"
                        ? providerState.openRouterStatus
                        : providerState.geminiStatus
                    }
                  />
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    // Await the writes and report their real outcome. These
                    // setters used to be fire-and-forget while the toast claimed
                    // success unconditionally, so a save that never reached the
                    // database still looked like it had worked -- until a
                    // refresh brought the old values back.
                    const savedKey = await aiProviderManager.setApiKey(
                      selectedProvider,
                      apiKeyInput.trim(),
                    );
                    const savedModel =
                      selectedProvider === "OpenRouter"
                        ? await aiProviderManager.setModel("OpenRouter", modelInput.trim())
                        : true;

                    if (savedKey && savedModel) {
                      toast.success(`${selectedProvider} settings saved`);
                    } else {
                      toast.error(
                        `Could not save ${selectedProvider} settings. They are active for this session but will not survive a refresh.`,
                      );
                    }
                  }}
                  className="space-y-5"
                >
                  {selectedProvider === "OpenRouter" && (
                    <div className="relative">
                      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        Model ID
                      </span>
                      <input
                        type="text"
                        value={modelInput}
                        onChange={(e) => setModelInput(e.target.value)}
                        placeholder="nvidia/nemotron-3-nano-30b-a3b:free"
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-violet/60 focus:bg-white/[0.06]"
                      />
                    </div>
                  )}

                  <div className="relative">
                    <span className="mb-1.5 block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      API Key
                    </span>
                    <div className="relative flex items-center">
                      <input
                        type={showKey ? "text" : "password"}
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder={`Enter ${selectedProvider} API Key...`}
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-3.5 pr-24 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-violet/60 focus:bg-white/[0.06]"
                      />
                      <div className="absolute right-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                          title={showKey ? "Hide API Key" : "Show API Key"}
                        >
                          {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-between gap-3 pt-2">
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={
                          !apiKeyInput.trim() ||
                          (selectedProvider === "OpenRouter" && !modelInput.trim())
                        }
                        className="btn-glow inline-flex h-10 items-center justify-center px-4 text-xs font-semibold disabled:opacity-50"
                      >
                        Save Settings
                      </button>
                      {(selectedProvider === "OpenRouter"
                        ? providerState.openRouterKey
                        : providerState.geminiKey) && (
                        <button
                          type="button"
                          onClick={handleRemoveKey}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 px-4 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/20"
                        >
                          Remove Key
                        </button>
                      )}
                      {providerState.activeProvider !== selectedProvider &&
                        (selectedProvider === "OpenRouter"
                          ? providerState.openRouterKey
                          : providerState.geminiKey) && (
                          <button
                            type="button"
                            onClick={async () => {
                              const activated =
                                await aiProviderManager.setActiveProviderName(selectedProvider);
                              if (activated) {
                                toast.success(`${selectedProvider} activated`);
                              } else {
                                toast.error(
                                  `${selectedProvider} is active for this session, but the change could not be saved.`,
                                );
                              }
                            }}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-violet/20 bg-violet/10 px-4 text-xs font-semibold text-violet-400 transition-all hover:bg-violet/20"
                          >
                            Activate
                          </button>
                        )}
                    </div>

                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testing || !apiKeyInput.trim()}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-xs font-semibold text-foreground/90 transition-all hover:bg-white/[0.06] hover:border-white/20 disabled:opacity-50"
                    >
                      {testing ? "Testing..." : "Test Connection"}
                    </button>
                  </div>
                </form>

                {/* Connection Test Status Output */}
                {testResult && (
                  <div
                    className={`mt-5 rounded-xl border p-4 text-xs animate-fade-in ${
                      testResult.success
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                        : "border-red-500/20 bg-red-500/5 text-red-400"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {testResult.success ? (
                        <ShieldCheck className="h-4.5 w-4.5 shrink-0 mt-0.5 text-emerald-400" />
                      ) : (
                        <ShieldAlert className="h-4.5 w-4.5 shrink-0 mt-0.5 text-red-400" />
                      )}
                      <div>
                        <strong className="block font-semibold mb-0.5">
                          {testResult.success ? "🟢 Connected" : "🔴 Unable to connect"}
                        </strong>
                        <span className="block leading-normal">{testResult.message}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Developer Information Card (only if devMode is active) */}
                {devMode && (
                  <div className="mt-8 border-t border-white/5 pt-6 animate-fade-in">
                    <CardLabel accent="electric">Developer Metrics</CardLabel>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-3">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/60">
                          Active Model
                        </span>
                        <span className="mt-1 block font-mono font-medium text-foreground truncate">
                          {selectedProvider === "OpenRouter"
                            ? providerState.openRouterMetrics.model
                            : providerState.geminiMetrics.model}
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/60">
                          Request Count
                        </span>
                        <span className="mt-1 block font-mono font-medium text-foreground">
                          {selectedProvider === "OpenRouter"
                            ? providerState.openRouterMetrics.requestCount
                            : providerState.geminiMetrics.requestCount}{" "}
                          requests
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/60">
                          Stream Status
                        </span>
                        <span className="mt-1 block font-mono font-medium text-foreground">
                          {selectedProvider === "OpenRouter"
                            ? providerState.openRouterMetrics.streamStatus
                            : providerState.geminiMetrics.streamStatus}
                        </span>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 col-span-2 md:col-span-1">
                        <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/60">
                          Last Response Time
                        </span>
                        <span className="mt-1 block font-mono font-medium text-foreground">
                          {selectedProvider === "OpenRouter"
                            ? providerState.openRouterMetrics.lastResponseTime
                            : providerState.geminiMetrics.lastResponseTime}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </CardShell>
            )}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset all local data?"
        description="Projects, missions, notes and chat will be restored to defaults."
        confirmLabel="Reset"
        destructive
        onConfirm={() => {
          akira.reset();
          toast.success("AKIRA reset to defaults");
        }}
      />
    </Shell>
  );
}

function Info2({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-display text-sm font-semibold">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; dot: string }> = {
    Connected: {
      label: "Connected",
      color: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
      dot: "bg-emerald-400 shadow-[0_0_8px_oklch(0.85_0.15_140)]",
    },
    "Local Mode": {
      label: "Local Mode",
      color: "border-white/10 bg-white/[0.05] text-muted-foreground",
      dot: "bg-muted-foreground",
    },
    "Missing API Key": {
      label: "Missing API Key",
      color: "border-amber-500/20 bg-amber-500/10 text-amber-400",
      dot: "bg-amber-400 shadow-[0_0_8px_oklch(0.85_0.15_80)]",
    },
    "Network Error": {
      label: "Network Error",
      color: "border-red-500/20 bg-red-500/10 text-red-400",
      dot: "bg-red-400 shadow-[0_0_8px_oklch(0.68_0.22_25)]",
    },
    "Invalid API Key": {
      label: "Invalid API Key",
      color: "border-red-500/20 bg-red-500/10 text-red-400",
      dot: "bg-red-400 shadow-[0_0_8px_oklch(0.68_0.22_25)]",
    },
  };

  const badge = map[status] || {
    label: status,
    color: "border-white/10 bg-white/[0.05] text-muted-foreground",
    dot: "bg-muted-foreground",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}
