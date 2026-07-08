// WhatsApp deep links — the island runs on WhatsApp, so does Cabby's.
// Configure VITE_WHATSAPP_NUMBER (digits only, country code included)
// to light up "Chat with us" throughout the app; hidden when unset.

const NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined)?.replace(/\D/g, "");

export const whatsappEnabled = Boolean(NUMBER);

export function whatsappLink(text: string): string | null {
  if (!NUMBER) return null;
  return `https://wa.me/${NUMBER}?text=${encodeURIComponent(text)}`;
}
