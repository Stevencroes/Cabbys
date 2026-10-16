import { Navigate, useLocation } from "react-router-dom";

/**
 * /driver is the address people guess for the driver portal, and the owner
 * asked for it to work. The portal itself stays at /drive: its own links,
 * its catch-all and the Google sign-in return path all point there, and
 * drivers already have it bookmarked — moving it would break those for
 * nothing.
 * So /driver and anything under it is a redirect, keeping the rest of the
 * path, the query and the hash — /driver/history lands on /drive/history.
 * `replace`, so Back does not bounce the driver into the redirect again.
 */
export default function DriverAlias() {
  const { pathname, search, hash } = useLocation();
  const rest = pathname.replace(/^\/driver/, "");
  return <Navigate to={`/drive${rest}${search}${hash}`} replace />;
}
