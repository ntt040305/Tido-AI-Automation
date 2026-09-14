"use client";

import React, { useCallback, useEffect, useState } from "react";

/**
 * Internal pipeline control.
 *
 * Not linked from anywhere in the product. It is reached by typing the URL,
 * which is the right amount of discoverability for a page whose only job is to
 * change how the renderer behaves for other people.
 *
 * The page is deliberately plain. Its value is that the current state is
 * unambiguous and rollback is one click, and neither of those is improved by
 * design work.
 */

type Flags = {
  active_pipeline: "stable" | "experiment";
  rollout_mode: "production" | "internal_only" | "ab_testing";
  ab_percentage: number;
  internal_testers: string[];
  features: Record<string, boolean>;
  components: Record<string, boolean>;
};

export default function PipelineAdminPage() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [killSwitch, setKillSwitch] = useState(false);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/pipeline", { cache: "no-store" });
    const json = await res.json();
    setFlags(json.flags);
    setComparison(json.comparison);
    setKillSwitch(Boolean(json.kill_switch_active));
  }, []);

  useEffect(() => {
    load().catch((e) => setStatus(String(e)));
  }, [load]);

  const save = async (next: Flags) => {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/pipeline", {
        method: "PUT",
        headers: { "content-type": "application/json", ...(token ? { "x-tido-admin-token": token } : {}) },
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "refused");
      setFlags(json.flags);
      setStatus("Saved. Takes effect on the next generation.");
      await load();
    } catch (e: any) {
      setStatus(`Not saved: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const rollback = async () => {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/pipeline", {
        method: "DELETE",
        headers: token ? { "x-tido-admin-token": token } : {},
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "refused");
      setFlags(json.flags);
      setStatus("Rolled back to stable. Takes effect on the next generation.");
    } catch (e: any) {
      setStatus(`Rollback failed: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  if (!flags) return <main style={{ padding: 32, fontFamily: "system-ui" }}>Loading pipeline state…</main>;

  const onExperiment = flags.active_pipeline === "experiment";
  const featuresOn = Object.keys(flags.features).filter((f) => flags.features[f]);

  const box: React.CSSProperties = {
    border: "1px solid #d7d7d7",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    background: "#fff",
  };

  return (
    <main style={{ padding: 32, fontFamily: "system-ui", maxWidth: 760, color: "#111" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Pipeline control</h1>
      <p style={{ color: "#555", marginTop: 0, fontSize: 13 }}>
        Internal. Changes apply to the next generation; nothing in flight is affected.
      </p>

      {killSwitch && (
        <div style={{ ...box, background: "#fff4f4", borderColor: "#e0a0a0" }}>
          <strong>Kill switch is on.</strong> <code>TIDO_PIPELINE_KILL_SWITCH=true</code> overrides everything on this
          page — all traffic is on stable with no features, whatever is saved below.
        </div>
      )}

      <div style={{ ...box, background: onExperiment ? "#fffaf0" : "#f4fbf4" }}>
        <div style={{ fontSize: 15 }}>
          Serving: <strong>{onExperiment ? "EXPERIMENT" : "STABLE"}</strong>{" "}
          <span style={{ color: "#555" }}>({flags.rollout_mode.replace("_", " ")})</span>
        </div>
        <div style={{ color: "#555", fontSize: 13, marginTop: 6 }}>
          {featuresOn.length === 0
            ? "No features enabled, so output is identical to stable even on the experiment pipeline."
            : `Features changing output: ${featuresOn.join(", ")}`}
        </div>
      </div>

      <div style={box}>
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Pipeline</span>
          <select
            value={flags.active_pipeline}
            onChange={(e) => setFlags({ ...flags, active_pipeline: e.target.value as Flags["active_pipeline"] })}
          >
            <option value="stable">Stable</option>
            <option value="experiment">Experiment</option>
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Who it reaches</span>
          <select
            value={flags.rollout_mode}
            onChange={(e) => setFlags({ ...flags, rollout_mode: e.target.value as Flags["rollout_mode"] })}
          >
            <option value="internal_only">Internal only</option>
            <option value="ab_testing">A/B testing</option>
            <option value="production">Production (everyone)</option>
          </select>
        </label>

        {flags.rollout_mode === "ab_testing" && (
          <label style={{ display: "block", marginBottom: 10 }}>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
              Experiment share: {flags.ab_percentage}%
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={flags.ab_percentage}
              onChange={(e) => setFlags({ ...flags, ab_percentage: Number(e.target.value) })}
            />
          </label>
        )}

        {flags.rollout_mode === "internal_only" && (
          <label style={{ display: "block", marginBottom: 10 }}>
            <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
              Tester ids (comma separated, sent as <code>x-tido-tester-id</code>)
            </span>
            <input
              style={{ width: "100%", padding: 6 }}
              value={flags.internal_testers.join(", ")}
              onChange={(e) =>
                setFlags({
                  ...flags,
                  internal_testers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="opaque ids only — not emails"
            />
          </label>
        )}
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Features</div>
        <p style={{ color: "#555", fontSize: 13, marginTop: 0 }}>
          Each one changes output independently and only on the experiment pipeline. None is implemented yet, so
          enabling one currently logs a warning and runs stable behaviour.
        </p>
        {Object.keys(flags.features).map((f) => (
          <label key={f} style={{ display: "block", marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={flags.features[f]}
              onChange={(e) => setFlags({ ...flags, features: { ...flags.features, [f]: e.target.checked } })}
            />{" "}
            <code>{f}</code>
          </label>
        ))}
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Component builds</div>
        {Object.keys(flags.components).map((c) => (
          <label key={c} style={{ display: "block", marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={flags.components[c]}
              onChange={(e) => setFlags({ ...flags, components: { ...flags.components, [c]: e.target.checked } })}
            />{" "}
            <code>{c}</code>
          </label>
        ))}
      </div>

      <div style={box}>
        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Admin token</span>
          <input
            type="password"
            style={{ width: "100%", padding: 6 }}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="required unless running on localhost"
          />
        </label>
        <button onClick={() => save(flags)} disabled={busy} style={{ padding: "8px 14px", marginRight: 10 }}>
          Save
        </button>
        <button
          onClick={rollback}
          disabled={busy}
          style={{ padding: "8px 14px", background: "#fff0f0", border: "1px solid #d08080" }}
        >
          Roll back to stable
        </button>
        {status && <div style={{ marginTop: 10, fontSize: 13 }}>{status}</div>}
      </div>

      {comparison && (
        <div style={box}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Stable vs experiment</div>
          <pre style={{ fontSize: 12, overflowX: "auto", margin: 0 }}>{JSON.stringify(comparison, null, 2)}</pre>
        </div>
      )}
    </main>
  );
}
