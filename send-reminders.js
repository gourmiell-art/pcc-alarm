/**
 * PC Concept Service — tagapadala ng paulit-ulit na alarm.
 * Pinapatakbo ng GitHub bawat 5 minuto. Lahat ng service na hindi pa tapos at
 * umabot na sa oras ng alarm ay pinapadalhan ng notification ang lahat ng phone,
 * tapos sine-set ang susunod na alarm. Titigil lang kapag "Tapos na" o nabura.
 */
const admin = require("firebase-admin");

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error("Walang FIREBASE_SERVICE_ACCOUNT secret. Tingnan ang gabay."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
const db = admin.firestore();

const MON = ["Ene", "Peb", "Mar", "Abr", "May", "Hun", "Hul", "Ago", "Set", "Okt", "Nob", "Dis"];
function when(date, time) {
  const [y, m, d] = String(date || "").split("-").map(Number);
  let [h, mi] = String(time || "").split(":").map(Number);
  if (!y || isNaN(h)) return "";
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return `${MON[m - 1]} ${d}, ${h}:${String(mi).padStart(2, "0")} ${ap}`;
}
const svcMs = (j) => Date.parse(`${j.date}T${j.time}:00+08:00`); // oras sa Pilipinas

async function run() {
  const now = Date.now();
  const due = await db.collection("jobs").where("nextAlert", "<=", now).get();
  if (due.empty) { console.log("Walang alarm ngayon."); return; }

  const tokSnap = await db.collection("tokens").get();
  const tokens = tokSnap.docs.map((d) => d.id);
  const bad = new Set();

  for (const doc of due.docs) {
    const j = doc.data();
    if (j.done) { await doc.ref.update({ nextAlert: null }); continue; }

    const repeatMin = Math.max(5, Number(j.repeat) || 15);
    await doc.ref.update({
      nextAlert: now + repeatMin * 60000,
      lastAlert: now,
      alertCount: admin.firestore.FieldValue.increment(1),
    });
    if (!tokens.length) { console.log(`Alarm para kay ${j.name} pero wala pang phone na naka-on ang notifications.`); continue; }

    const late = svcMs(j) < now;
    const title = `${late ? "LUMAMPAS NA · " : ""}Service: ${j.name || ""}`;
    const body = [
      `${j.device || ""} · ${j.problem || ""}`,
      `${when(j.date, j.time)}${j.loc ? " · " + j.loc : ""}`,
      `${j.phone || ""}${j.branch ? " · " + j.branch : ""}`,
    ].join("\n");

    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      const res = await admin.messaging().sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: { jobId: doc.id },
        webpush: {
          headers: { Urgency: "high", TTL: String(repeatMin * 60) },
          notification: {
            tag: "pcc-" + doc.id, renotify: true, requireInteraction: true,
            icon: "/icon-192.png", vibrate: [400, 200, 400, 200, 400],
          },
          fcmOptions: { link: "/?job=" + encodeURIComponent(doc.id) },
        },
      });
      res.responses.forEach((r, k) => {
        const code = r.error && r.error.code;
        if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"].includes(code)) bad.add(chunk[k]);
      });
    }
    console.log(`Alarm: ${j.name} -> ${tokens.length} phone(s)`);
  }
  await Promise.all([...bad].map((t) => db.doc("tokens/" + t).delete().catch(() => {})));
}

module.exports = { run };
if (require.main === module) run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
