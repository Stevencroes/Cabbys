// The striped semicircle sun — the signature element, exactly as in the
// v3 mockup. Hero (persimmon on bone) and closer (amber on cocoa) only.
export default function SunGraphic({ variant = "hero" }: { variant?: "hero" | "closer" }) {
  if (variant === "closer") {
    return (
      <svg viewBox="0 0 900 340" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs><clipPath id="csun"><rect x="0" y="0" width="900" height="312" /></clipPath></defs>
        <g clipPath="url(#csun)">
          <circle cx="450" cy="340" r="290" fill="#E2A03F" />
          <rect x="60" y="200" width="780" height="15" fill="#2B1F19" />
          <rect x="60" y="234" width="780" height="19" fill="#2B1F19" />
          <rect x="60" y="276" width="780" height="25" fill="#2B1F19" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 1000 340" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="hsun"><rect x="0" y="0" width="1000" height="312" /></clipPath></defs>
      <g clipPath="url(#hsun)">
        <circle cx="500" cy="340" r="290" fill="#C6452C" />
        <rect x="80" y="200" width="840" height="15" fill="#F2E9D5" />
        <rect x="80" y="234" width="840" height="19" fill="#F2E9D5" />
        <rect x="80" y="276" width="840" height="25" fill="#F2E9D5" />
      </g>
      <path d="M212,340 A290,290 0 0 1 788,340" fill="none" stroke="#2B1F19" strokeWidth="3" />
    </svg>
  );
}
