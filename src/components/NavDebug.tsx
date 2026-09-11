// A temporary readout of the numbers behind the nav's position, because
// four attempts at the gap above it were made from measuring screenshots
// and every one of them was wrong about a different thing.
//
// Nothing here ships to a visitor: it renders only for ?navdebug=1, the
// same convention lib/mapDebug.ts already uses for the maps. Delete this
// file and the one line in Nav.tsx once the gap is understood.
import { useEffect, useState } from "react";

interface Reading {
  dpr: number;
  win: string;
  vv: string;
  vvOffset: string;
  scale: string;
  safeTop: string;
  navTop: string;
  navHeight: string;
  navBg: string;
  scrollY: number;
}

/** The safe-area inset is only readable through a probe: env() is valid in
    a property value, never in a script, so an element has to be given the
    value and then measured. */
function safeAreaTop(): string {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;visibility:hidden;height:env(safe-area-inset-top,0px)";
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return `${Math.round(h)}px`;
}

export default function NavDebug() {
  const on = typeof location !== "undefined" && location.search.includes("navdebug");
  const [r, setR] = useState<Reading | null>(null);

  useEffect(() => {
    if (!on) return;
    const read = () => {
      const nav = document.querySelector(".nav");
      const box = nav?.getBoundingClientRect();
      const cs = nav ? getComputedStyle(nav) : null;
      const vv = window.visualViewport;
      setR({
        dpr: devicePixelRatio,
        win: `${innerWidth}×${innerHeight}`,
        vv: vv ? `${Math.round(vv.width)}×${Math.round(vv.height)}` : "none",
        vvOffset: vv ? `${Math.round(vv.offsetTop)} / ${Math.round(vv.pageTop)}` : "none",
        scale: vv ? vv.scale.toFixed(2) : "none",
        safeTop: safeAreaTop(),
        navTop: box ? `${Math.round(box.top)}px` : "no .nav",
        navHeight: box ? `${Math.round(box.height)}px` : "—",
        navBg: cs ? cs.backgroundColor : "—",
        scrollY: Math.round(window.scrollY),
      });
    };
    read();
    const vv = window.visualViewport;
    addEventListener("scroll", read, true);
    addEventListener("resize", read);
    vv?.addEventListener("resize", read);
    vv?.addEventListener("scroll", read);
    return () => {
      removeEventListener("scroll", read, true);
      removeEventListener("resize", read);
      vv?.removeEventListener("resize", read);
      vv?.removeEventListener("scroll", read);
    };
  }, [on]);

  if (!on || !r) return null;

  const rows: [string, string | number][] = [
    ["nav top", r.navTop],
    ["nav height", r.navHeight],
    ["nav bg", r.navBg],
    ["safe-area-top", r.safeTop],
    ["window", r.win],
    ["visualViewport", r.vv],
    ["vv offsetTop/pageTop", r.vvOffset],
    ["vv scale", r.scale],
    ["scrollY", r.scrollY],
    ["dpr", r.dpr],
  ];

  return (
    // magenta on black, mid-screen: it has to survive a photograph of a
    // phone held at arm's length, not look like part of the design
    <div
      style={{
        position: "fixed", top: "38%", left: 8, right: 8, zIndex: 2147483647,
        background: "#000", color: "#FF4FD8", border: "2px solid #FF4FD8",
        borderRadius: 8, padding: "10px 12px", pointerEvents: "none",
        font: "600 13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace",
      }}
    >
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span style={{ opacity: 0.75 }}>{k}</span>
          <span>{String(v)}</span>
        </div>
      ))}
    </div>
  );
}
