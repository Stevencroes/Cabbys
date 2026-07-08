// Add-to-calendar (.ics) — generated client-side, no service needed.
// Times are written as floating local time: "14:30" means 14:30 in Aruba,
// which is exactly what the traveler's phone should show once they land.

export interface IcsEvent {
  title: string;
  description?: string;
  location?: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  time: string;
  durationMinutes?: number;
  uid?: string;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function stamp(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(/:/g, "")}00`;
}

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const d = new Date(`${date}T${time}:00`);
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function buildIcs(ev: IcsEvent): string {
  const duration = ev.durationMinutes ?? 60;
  const end = addMinutes(ev.date, ev.time, duration);
  const uid = ev.uid ?? `${stamp(ev.date, ev.time)}@cabbys.aw`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cabbys Aruba//Transfer//EN",
    "BEGIN:VEVENT",
    `UID:${esc(uid)}`,
    `DTSTART:${stamp(ev.date, ev.time)}`,
    `DTEND:${stamp(end.date, end.time)}`,
    `SUMMARY:${esc(ev.title)}`,
    ev.location ? `LOCATION:${esc(ev.location)}` : "",
    ev.description ? `DESCRIPTION:${esc(ev.description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

export function downloadIcs(ev: IcsEvent, filename = "cabbys-transfer.ics"): void {
  const blob = new Blob([buildIcs(ev)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
