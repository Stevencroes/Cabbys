export default function Diamond({ hollow = false, size = 5 }: { hollow?: boolean; size?: number }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      background: hollow ? "transparent" : "var(--silver)",
      border: hollow ? "1px solid var(--silver-deep)" : "none",
      transform: "rotate(45deg)", flexShrink: 0,
    }} />
  );
}
