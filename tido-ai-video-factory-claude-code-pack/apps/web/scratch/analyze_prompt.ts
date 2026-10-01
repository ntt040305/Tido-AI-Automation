import fs from "fs";
import crypto from "crypto";

const txt = fs.readFileSync("scratch/full_verbatim_provider_prompt.txt", "utf8");

const prompt_chars = txt.length;
const prompt_bytes = Buffer.byteLength(txt, "utf8");
const prompt_hash = crypto.createHash("sha256").update(txt).digest("hex");

console.log("prompt_chars:", prompt_chars);
console.log("prompt_bytes:", prompt_bytes);
console.log("prompt_hash:", prompt_hash);

// Normalized LF
const txt_lf = txt.replace(/\r\n/g, "\n");
console.log("\nLF Normalized:");
console.log("prompt_chars_lf:", txt_lf.length);
console.log("prompt_bytes_lf:", Buffer.byteLength(txt_lf, "utf8"));
console.log("prompt_hash_lf:", crypto.createHash("sha256").update(txt_lf).digest("hex"));

// Section parsing
const regex = /(?=<!-- ID: master_prompt_v2|## ROLE|## CREATIVE INTENT|## CAMPAIGN STRATEGY|## USER HARD REQUIREMENTS|## TYPOGRAPHY & READABLE COPY|## REFERENCE SEMANTICS|## PRODUCT INSTANCE REQUIREMENTS|## ART DIRECTION|## COMMERCIAL LAYOUT|## CONFLICT PRIORITY|## FINAL OUTPUT)/;
const parts = txt.split(regex).filter(Boolean);

console.log("\n| Section | Start | End | Chars | Owner |");
console.log("|---|---|---|---|---|");

let offset = 0;
const owners: Record<string, string> = {
  "<!-- ID:": "MasterPromptCompiler (Template Header)",
  "## ROLE": "MasterPromptCompiler (master_prompt_v2.md)",
  "## CREATIVE INTENT": "User Brief & MarketingContext",
  "## CAMPAIGN STRATEGY": "MarketingBrainService",
  "## USER HARD REQUIREMENTS": "User Hard Constraints & Style Controls",
  "## TYPOGRAPHY & READABLE COPY": "ExactCopyIntegrityValidator & User Copy",
  "## REFERENCE SEMANTICS": "ReferenceIntelligenceService",
  "## PRODUCT INSTANCE REQUIREMENTS": "KnowledgeRouterService & Reference Manifest",
  "## ART DIRECTION": "ArtDirectionResolverService",
  "## COMMERCIAL LAYOUT": "CommercialLayoutService",
  "## CONFLICT PRIORITY": "master_prompt_v2.md (Template Conflict Hierarchy)",
  "## FINAL OUTPUT": "master_prompt_v2.md & Creative Constraints",
};

parts.forEach((sec, idx) => {
  const firstLine = sec.trim().split(/\r?\n/)[0];
  const start = offset;
  const chars = sec.length;
  const end = start + chars;
  offset = end;

  let owner = "MasterPromptCompiler";
  for (const [prefix, own] of Object.entries(owners)) {
    if (firstLine.startsWith(prefix)) {
      owner = own;
      break;
    }
  }

  console.log(`| ${firstLine.slice(0, 32)} | ${start} | ${end} | ${chars} | ${owner} |`);
});

console.log("\nTotal Sum of Chars:", offset);
