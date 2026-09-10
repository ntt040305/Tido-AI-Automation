# -*- coding: utf-8 -*-
"""Fix the LLM call shape and the template direction construction."""
import io

p = "lib/image-engine/benchmark/LegacyCreativeProvider.ts"
s = io.open(p, encoding="utf-8").read()

OLD_CALL = '''    const res = await this.llm.complete(buildPrompt(c), {
      temperature: 0.7,
      max_tokens: 1200,
      timeoutMs: 60000,
    });
    const text = typeof res === "string" ? res : (res as any)?.content || (res as any)?.text || "";
    const match = text.match(/\\{[\\s\\S]*\\}/);'''

NEW_CALL = '''    // One call, one round trip, brief to finished direction. Explicit timeout and
    // token ceiling because the campaign pipeline learned the hard way that a
    // default 15s timeout silently turns a working feature into a dead one.
    const text = await this.llm.generateChatCompletion(
      [{ role: "user", content: buildPrompt(c) }],
      "benchmark_legacy_baseline",
      { temperature: 0.7, max_tokens: 1200, timeoutMs: 60000 }
    );
    const match = String(text || "").match(/\\{[\\s\\S]*\\}/);'''
assert OLD_CALL in s, "llm call anchor missing"
s = s.replace(OLD_CALL, NEW_CALL)

OLD_DIR = '''      direction: { ...conv, insight: undefined, idea: undefined } as unknown as LegacyCreativeOutput["direction"],
      backend: "template",'''
NEW_DIR = '''      // Fields listed explicitly rather than spread: the convention record also
      // carries `insight` and `idea`, and spreading would put both onto a
      // direction object that has no business holding them.
      direction: {
        camera: conv.camera,
        lighting: conv.lighting,
        composition: conv.composition,
        colour: conv.colour,
        atmosphere: conv.atmosphere,
        typography: conv.typography,
        material: conv.material,
      },
      backend: "template",'''
assert OLD_DIR in s, "direction anchor missing"
s = s.replace(OLD_DIR, NEW_DIR)

# Tighten the convention record type now that fields are read explicitly.
OLD_TYPE = '''const CATEGORY_CONVENTIONS: Record<
  string,
  Omit<LegacyCreativeOutput["direction"], never> & { insight: string; idea: string }
> = {'''
NEW_TYPE = '''type CategoryConvention = LegacyCreativeOutput["direction"] & { insight: string; idea: string };

const CATEGORY_CONVENTIONS: Record<string, CategoryConvention> = {'''
assert OLD_TYPE in s, "convention type anchor missing"
s = s.replace(OLD_TYPE, NEW_TYPE)

io.open(p, "w", encoding="utf-8").write(s)
print("provider corrected")
