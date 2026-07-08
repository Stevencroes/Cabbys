// Per-class vehicle silhouettes — quiet line drawings, one per fleet tier,
// so the ride list reads at a glance instead of four identical icons.

const STROKE = {
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none",
};

export default function VehicleGlyph({ id }: { id: string }) {
  switch (id) {
    case "premium":
      // Long executive sedan — stretched cabin, raked rear glass
      return (
        <svg width="38" height="20" viewBox="0 0 38 20" aria-hidden="true">
          <path {...STROKE} d="M2 14 L3 11 C3.5 9.8 4.5 9 6 9 L9 9 L12 4.5 L24 4.5 L29 9 L33 9.5 C34.5 9.8 35.5 10.8 35.5 12 L35.5 14 C35.5 14.8 34.8 15.5 34 15.5 L4 15.5 C2.8 15.5 2 14.9 2 14 Z" />
          <path {...STROKE} d="M13 9 L14.5 5.5 L22.5 5.5 L26 9" />
          <circle {...STROKE} cx="9" cy="15.5" r="2.6" />
          <circle {...STROKE} cx="29" cy="15.5" r="2.6" />
        </svg>
      );
    case "suv":
      // Tall square-shouldered SUV
      return (
        <svg width="36" height="22" viewBox="0 0 36 22" aria-hidden="true">
          <path {...STROKE} d="M3 16 L3 10 C3 8.5 4 7.5 5.5 7.5 L8 7.5 L10.5 3 L26 3 L29 7.5 L31.5 8 C32.8 8.3 33.5 9.2 33.5 10.5 L33.5 16 C33.5 16.8 32.8 17.5 32 17.5 L4.5 17.5 C3.7 17.5 3 16.9 3 16 Z" />
          <path {...STROKE} d="M11.5 7.5 L13 4.5 L24.5 4.5 L27 7.5" />
          <path {...STROKE} d="M18.5 4.5 L18.5 7.5" />
          <circle {...STROKE} cx="9.5" cy="17.5" r="2.8" />
          <circle {...STROKE} cx="27.5" cy="17.5" r="2.8" />
        </svg>
      );
    case "van":
      // Boxy V-Class van — flat nose, long roofline
      return (
        <svg width="36" height="22" viewBox="0 0 36 22" aria-hidden="true">
          <path {...STROKE} d="M3.5 16.5 L3.5 7 C3.5 5.6 4.6 4.5 6 4.5 L27 4.5 C28 4.5 28.9 5 29.4 5.9 L32.5 11 L32.5 16.5 C32.5 17.3 31.8 18 31 18 L5 18 C4.2 18 3.5 17.3 3.5 16.5 Z" />
          <path {...STROKE} d="M25.5 4.8 L28.5 10.5 L32.3 10.8" />
          <path {...STROKE} d="M3.5 10.5 L25 10.5 M12 4.5 L12 10.5 M19 4.5 L19 10.5" opacity="0.7" />
          <circle {...STROKE} cx="9.5" cy="18" r="2.7" />
          <circle {...STROKE} cx="26.5" cy="18" r="2.7" />
        </svg>
      );
    case "sedan":
    default:
      // Classic three-box sedan
      return (
        <svg width="34" height="20" viewBox="0 0 34 20" aria-hidden="true">
          <path {...STROKE} d="M2.5 13.5 L4 10.5 C4.5 9.5 5.4 9 6.5 9 L9.5 9 L12.5 5 L22 5 L25.5 9 L28.5 9.5 C30 9.8 31 10.8 31 12 L31 13.5 C31 14.3 30.3 15 29.5 15 L4 15 C3.2 15 2.5 14.4 2.5 13.5 Z" />
          <path {...STROKE} d="M13.5 9 L15 6 L21 6 L23.5 9" />
          <circle {...STROKE} cx="8.5" cy="15" r="2.6" />
          <circle {...STROKE} cx="25.5" cy="15" r="2.6" />
        </svg>
      );
  }
}
