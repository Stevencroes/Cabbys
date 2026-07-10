// The striped sun — brand signature. Hero and closing moments only.
export default function StripedSun({ variant = "hero" }: { variant?: "hero" | "confirm" }) {
  if (variant === "confirm") {
    return (
      <svg viewBox="0 0 300 190" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs><clipPath id="cs-sun"><rect x="0" y="0" width="300" height="150" /></clipPath></defs>
        <g clipPath="url(#cs-sun)">
          <circle cx="150" cy="150" r="130" fill="#B93F33" />
          <rect x="14" y="98" width="272" height="9" fill="#F1E7D0" />
          <rect x="14" y="116" width="272" height="11" fill="#F1E7D0" />
          <rect x="14" y="138" width="272" height="13" fill="#F1E7D0" />
        </g>
        <circle cx="150" cy="150" r="130" fill="none" stroke="#2E211A" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 520 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="hs-sun"><rect x="0" y="0" width="520" height="250" /></clipPath></defs>
      <g clipPath="url(#hs-sun)">
        <circle cx="260" cy="250" r="220" fill="#B93F33" />
        <rect x="20" y="160" width="480" height="13" fill="#F1E7D0" />
        <rect x="20" y="188" width="480" height="15" fill="#F1E7D0" />
        <rect x="20" y="220" width="480" height="18" fill="#F1E7D0" />
      </g>
      <circle cx="260" cy="250" r="220" fill="none" stroke="#2E211A" strokeWidth="2.5" />
      <line x1="8" y1="250" x2="512" y2="250" stroke="#2E211A" strokeWidth="2.5" />
    </svg>
  );
}
