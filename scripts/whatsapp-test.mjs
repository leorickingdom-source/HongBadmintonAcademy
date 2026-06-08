// Send the pre-approved hello_world template to verify WhatsApp connectivity.
// node --env-file=.env.local scripts/whatsapp-test.mjs <PHONE_NUMBER_ID> <+recipient>
// (reads WHATSAPP_API_TOKEN + WHATSAPP_API_VERSION from .env.local)
const token = process.env.WHATSAPP_API_TOKEN;
const version = process.env.WHATSAPP_API_VERSION || "v21.0";
const phoneId = process.argv[2];
const to = (process.argv[3] || "").replace(/[^\d]/g, "");

if (!token) { console.log("Missing WHATSAPP_API_TOKEN in .env.local"); process.exit(1); }
if (!phoneId || !to) { console.log("Usage: ... whatsapp-test.mjs <PHONE_NUMBER_ID> <+recipient>"); process.exit(1); }

const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: { name: "hello_world", language: { code: "en_US" } },
  }),
});
const json = await res.json();
console.log("HTTP", res.status);
console.log(JSON.stringify(json, null, 2));
if (json?.messages?.[0]?.id) console.log("\n✅ Sent. message id:", json.messages[0].id);
