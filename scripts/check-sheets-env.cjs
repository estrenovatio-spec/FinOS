const u = (process.env.GOOGLE_SHEETS_WEBHOOK_URL || "").trim();
const s = (process.env.HOUSEHOLD_SESSION_SECRET || "").trim();
console.log("HOUSEHOLD_SESSION_SECRET set:", Boolean(s), "length:", s.length);
if (!u) {
  console.log("GOOGLE_SHEETS_WEBHOOK_URL: NOT SET");
  process.exit(1);
}
try {
  const url = new URL(u);
  console.log("webhook host:", url.host);
  console.log("ends with /exec:", u.endsWith("/exec"));
  console.log(
    "script.google count:",
    (u.match(/script\.google\.com/g) || []).length,
  );
  console.log("bad /exec/exec:", u.includes("/exec/exec"));
  console.log("spreadsheets link:", u.includes("docs.google.com/spreadsheets"));
} catch (e) {
  console.log("webhook URL invalid:", e.message);
  process.exit(1);
}
