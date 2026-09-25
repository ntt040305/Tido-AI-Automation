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
  features: Record<string, boolean>;
  components: Record<string, boolean>;
};

export default function PipelineAdminPage() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [core, setCore] = useState<string[]>([]);
  const [killSwitch, setKillSwitch] = useState(false);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/pipeline", { cache: "no-store" });
    const json = await res.json();
    setFlags(json.flags);
    setComparison(json.comparison);
    setCore(Array.isArray(json.core_features) ? json.core_features : []);
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
      setStatus("Experiments reset. The core pipeline only, from the next generation.");
    } catch (e: any) {
      setStatus(`Rollback failed: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  if (!flags) return <main style={{ padding: 32, fontFamily: "system-ui" }}>Loading pipeline state…</main>;

  const experiments = Object.keys(flags.features).filter((f) => !core.includes(f));
  const experimentsOn = experiments.filter((f) => flags.features[f]);

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
          page — every feature is off and renders go through the core without the Creative Director.
        </div>
      )}

      <div style={{ ...box, background: "#f4fbf4" }}>
        <div style={{ fontSize: 15 }}>
          Serving: <strong>one creative pipeline</strong> <span style={{ color: "#555" }}>(all traffic)</span>
        </div>
        <div style={{ color: "#555", fontSize: 13, marginTop: 6 }}>
          {experimentsOn.length === 0
            ? "No experiments enabled: the core architecture only."
            : `Experiments on top of the core: ${experimentsOn.join(", ")}`}
        </div>
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Core architecture</div>
        <p style={{ color: "#555", fontSize: 13, marginTop: 0 }}>
          Always on. Part of the pipeline, not a setting — changing one is a code change.
        </p>
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          {core.map((f) => (
            <code key={f} style={{ display: "inline-block", marginRight: 8 }}>{f}</code>
          ))}
        </div>
      </div>

      <div style={box}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Experiments</div>
        <p style={{ color: "#555", fontSize: 13, marginTop: 0 }}>
          Built but not validated. Off by default; each changes output independently.
        </p>
        {experiments.map((f) => (
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
          Reset experiments
        </button>
        {status && <div style={{ marginTop: 10, fontSize: 13 }}>{status}</div>}
      </div>

      {comparison && (
        <div style={box}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Recorded runs by pipeline (history)</div>
          <pre style={{ fontSize: 12, overflowX: "auto", margin: 0 }}>{JSON.stringify(comparison, null, 2)}</pre>
        </div>
      )}
    </main>
  );
}
