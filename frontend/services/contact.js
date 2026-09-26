export function whatsappLink(number, message) {
  const digits = String(number || "").replace(/\D/g, "");
  if (!/^\d{12,13}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
