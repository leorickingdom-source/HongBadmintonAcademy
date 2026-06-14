// Normalize a phone to E.164 for WhatsApp. Malaysian numbers are the default:
// a leading 0 is the local trunk prefix (drop it, prepend +60), a bare 60 just
// needs a +, "00" is an international access prefix, and anything already
// starting with + is kept as-is. Returns null if it can't form a plausible
// number. Parents here are MY; international numbers must be entered with their
// own + country code.
export function normalizePhoneMY(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  let e164: string;
  if (cleaned.startsWith("+")) {
    e164 = "+" + cleaned.slice(1).replace(/\+/g, "");
  } else if (cleaned.startsWith("00")) {
    e164 = "+" + cleaned.slice(2); // international access code
  } else if (cleaned.startsWith("60")) {
    e164 = "+" + cleaned; // MY country code, missing the +
  } else if (cleaned.startsWith("0")) {
    e164 = "+60" + cleaned.slice(1); // local trunk 0 → +60
  } else {
    e164 = "+60" + cleaned; // bare local mobile, e.g. 12-3456789
  }

  const digits = e164.replace(/\D/g, "");
  return digits.length >= 8 ? e164 : null;
}

// Build a WhatsApp "click to chat" link (wa.me). No API / business
// verification needed — opens WhatsApp with the message pre-filled for the
// admin to send manually. Phone is normalized to E.164 first, so a number
// stored as "012-345 6789" still produces a valid 60… link.
export function waLink(phone: string | null | undefined, text: string): string | null {
  const e164 = normalizePhoneMY(phone);
  if (!e164) return null;
  const digits = e164.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
