const fs = require("fs");
const path = require("path");

const roots = ["lib/image-engine", "app/api", "app/campaign-test", "components/Sidebar.tsx"];
const out = [];
const now = Date.now();

function walk(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) walk(path.join(p, e));
    return;
  }
  if (!/\.(ts|tsx)$/.test(p)) return;
  const ageMin = (now - st.mtimeMs) / 60000;
  if (ageMin < 25) out.push(ageMin.toFixed(1).padStart(6) + " min ago  " + p.split(path.sep).join("/"));
}

roots.forEach(walk);
out.sort();
fs.writeFileSync(
  "D:/Tido/.tmp-work/touched.txt",
  "Source files modified in the last 25 minutes:\n" + (out.join("\n") || "(none)")
);
