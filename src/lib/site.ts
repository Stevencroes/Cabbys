/**
 * The domain Cabby's owns. One place, because it used to be written out
 * by hand in the footer and in calendar invites as "cabbys.aw" — a domain
 * nobody had bought — and a name typed in three places is a name that
 * ends up spelled three ways.
 */
export const SITE_DOMAIN = "cabbystransfer.com";

/**
 * The address every guest email is sent FROM — the confirmation and the
 * driver email (FROM_GUEST in api/booking-alerts.ts, which keeps its own
 * copy because api/ cannot import from src/; bookingAlerts.test holds the
 * two equal). The landing page names it so a guest knows which address to
 * look for, and to search their spam for, before the first one arrives.
 */
export const BOOKINGS_EMAIL = `bookings@${SITE_DOMAIN}`;
