// Build a WhatsApp "click to chat" link (wa.me). No API / business
// verification needed — opens WhatsApp with the message pre-filled for the
// admin to send manually.
export function waLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
