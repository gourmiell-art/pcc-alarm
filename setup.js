/* PC Concept Service — setup. Patakbuhin: node setup.js */
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = [], waiters = [];
rl.on("line", (l) => { const w = waiters.shift(); if (w) w(l); else lines.push(l); });
const nextLine = () => new Promise((r) => { if (lines.length) r(lines.shift()); else waiters.push(r); });
const ask = async (q) => { process.stdout.write(q); return (await nextLine()).trim(); };

async function readBlock() {
  let buf = "";
  for (;;) {
    const line = await nextLine();
    buf += line + "\n";
    if (/apiKey/.test(buf) && /appId/.test(buf) && /^\s*};?\s*$/.test(line)) return buf;
  }
}

(async () => {
  console.log("\n=== PC Concept Service — Setup ===\n");
  console.log("1) I-paste ang buong firebaseConfig mula sa Firebase (yung may apiKey, authDomain, projectId...),");
  console.log("   tapos pindutin ang Enter:\n");
  const block = await readBlock();
  const pick = (k) => { const m = block.match(new RegExp(k + "\\s*:\\s*[\"']([^\"']+)[\"']")); return m ? m[1] : ""; };
  const cfg = {
    apiKey: pick("apiKey"), authDomain: pick("authDomain"), projectId: pick("projectId"),
    storageBucket: pick("storageBucket"), messagingSenderId: pick("messagingSenderId"), appId: pick("appId"),
  };
  if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
    console.log("\nHindi mabasa ang config. Siguraduhing kinopya ang buong bahagi mula sa 'const firebaseConfig = {' hanggang '};'.");
    process.exit(1);
  }
  console.log("\n   OK! Project: " + cfg.projectId + "\n");

  let vapid = "";
  while (vapid.length < 40) {
    vapid = (await ask("2) I-paste ang Web Push key (Key pair mula sa Cloud Messaging), tapos Enter:\n> ")).replace(/\s/g, "");
    if (vapid.length < 40) console.log("   Mukhang kulang ang key. Kopyahin ulit ang buong Key pair.\n");
  }
  let owner = (await ask("\n3) Email ng admin [gourmiell@gmail.com]: ")).toLowerCase() || "gourmiell@gmail.com";
  let ownerName = (await ask("4) Pangalan mo na lalabas sa app [Admin]: ")) || "Admin";
  rl.close();

  const conf = `/* Ginawa ng setup.js */
self.PCC_CONFIG = ${JSON.stringify({ firebase: cfg, vapidKey: vapid, ownerEmail: owner, ownerName }, null, 2)};
`;
  fs.writeFileSync(path.join(__dirname, "public", "firebase-config.js"), conf);
  const rules = fs.readFileSync(path.join(__dirname, "firestore.rules.template"), "utf8").replace(/__OWNER_EMAIL__/g, owner);
  fs.writeFileSync(path.join(__dirname, "firestore.rules"), rules);
  fs.writeFileSync(path.join(__dirname, ".firebaserc"), JSON.stringify({ projects: { default: cfg.projectId } }, null, 2));

  console.log("\n✔ Tapos ang setup!");
  console.log("  Susunod: i-type ang  firebase deploy  tapos Enter.");
  console.log("  Pagkatapos, buksan sa phone: https://" + cfg.projectId + ".web.app\n");
})();
