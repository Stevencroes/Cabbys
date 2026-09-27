// Tests for api/booking-alerts.ts. They live under src/ because every
// file in api/ is deployed as an endpoint, a test file included.
import { describe, it, expect, vi } from "vitest";
import handler, {
  VEHICLE_NAMES, buildAlertEmail, countdown, runAlerts,
  type ClaimedAlert, type Deps, type Email,
} from "../../api/booking-alerts";
import { VEHICLES } from "../data/vehicles";
import { SITE_DOMAIN } from "../lib/site";

// 14:00 in Aruba on Sat 3 Oct 2026 is 18:00 UTC.
const PICKUP = "2026-10-03T18:00:00.000Z";
const NOW = Date.parse("2026-10-03T16:10:00.000Z"); // 1 h 50 min before

function alert(over: Partial<ClaimedAlert> = {}, ride: Record<string, unknown> = {}): ClaimedAlert {
  return {
    id: "al-1",
    kind: "new",
    attempts: 1,
    pickup_at: PICKUP,
    ride: {
      id: "5f0c2a4e-1111-2222-3333-444455556666",
      booking_ref: "CB-7KM4Q",
      status: "pending",
      driver_id: null,
      pickup_location: "Queen Beatrix Airport",
      dropoff_location: "The Ritz-Carlton, Aruba",
      vehicle_class: "suv",
      passengers_count: 2,
      luggage_count: 3,
      contact_name: "Ana Croes",
      contact_phone: "+1 555 010 2030",
      contact_email: "ana@example.com",
      flight_number: "B6 1234",
      fare_total: 64.5,
      ...ride,
    },
    ...over,
  };
}

describe("what the alert says", () => {
  it("leads a new booking with whether anybody is driving it, on Aruba's clock", () => {
    const e = buildAlertEmail(alert(), { now: NOW });
    expect(e.subject).toBe("New booking — no driver yet · Sat 3 Oct, 2:00 PM · CB-7KM4Q");
    expect(e.to).toBe("cabbystransfer@gmail.com");
    expect(e.from).toMatch(/@cabbystransfer\.com>$/);
    expect(e.text).toContain("Vehicle: Luxury SUV");
    expect(e.text).toContain("Fare: US$65");
    expect(e.text).toContain("Driver: Nobody yet");
  });

  it("says a driver is already on it when one is", () => {
    const e = buildAlertEmail(alert({}, { driver_id: "d1", driver_name: "Ruben" }), { now: NOW });
    expect(e.subject).toBe("New booking · Sat 3 Oct, 2:00 PM · CB-7KM4Q");
    expect(e.text).toContain("Ruben is already on it");
  });

  it("counts down on the reminders, and the two-hour one is marked urgent", () => {
    expect(buildAlertEmail(alert({ kind: "remind_12h" }), { now: Date.parse("2026-10-03T06:00:00Z") }).subject)
      .toBe("Still no driver — pickup in 12 h · CB-7KM4Q");
    expect(buildAlertEmail(alert({ kind: "remind_2h" }), { now: NOW }).subject)
      .toBe("URGENT: no driver — pickup in 1 h 50 min · CB-7KM4Q");
  });

  it("links straight to the ride on the admin board", () => {
    const e = buildAlertEmail(alert(), { now: NOW });
    expect(e.html).toContain(`href="https://${SITE_DOMAIN}/admin/rides/5f0c2a4e-1111-2222-3333-444455556666"`);
    expect(e.html).toContain("Assign a driver");
  });

  // Everything in it was typed into a public booking form.
  it("escapes what the guest typed", () => {
    const e = buildAlertEmail(alert({}, {
      contact_name: '<img src=x onerror="steal()">',
      notes: "<script>alert(1)</script> & more",
    }), { now: NOW });
    expect(e.html).not.toContain("<script>");
    expect(e.html).not.toContain("<img");
    expect(e.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
  });

  it("offers WhatsApp only for a number it can dial internationally", () => {
    expect(buildAlertEmail(alert(), { now: NOW }).html).toContain('href="https://wa.me/15550102030"');
    const local = buildAlertEmail(alert({}, { contact_phone: "555 1234" }), { now: NOW }).html;
    expect(local).toContain('href="tel:5551234"');
    expect(local).not.toContain("wa.me");
  });

  it("still says something useful about a booking with gaps in it", () => {
    const e = buildAlertEmail(alert({ pickup_at: null }, {
      booking_ref: null, contact_name: null, contact_phone: null, vehicle_class: null, fare_total: null,
    }), { now: NOW });
    expect(e.subject).toMatch(/^New booking — no driver yet · No pickup time on the booking · CB-/);
    expect(e.text).toContain("Guest: No name given");
    expect(e.text).not.toContain("Fare:");
  });

  it("keeps its copy of the vehicle names equal to the site's", () => {
    expect(VEHICLE_NAMES).toEqual(Object.fromEntries(VEHICLES.map((v) => [v.id, v.name])));
  });

  it("counts down in whole minutes and says nothing once pickup has passed", () => {
    expect(countdown(NOW, PICKUP)).toBe("1 h 50 min");
    expect(countdown(Date.parse("2026-10-03T17:15:00Z"), PICKUP)).toBe("45 min");
    expect(countdown(Date.parse("2026-10-03T18:05:00Z"), PICKUP)).toBeNull();
  });
});

function deps(claim: unknown, sends: Array<{ ok: true; id: string } | { ok: false; error: string }> = []) {
  const rpc = vi.fn<Deps["rpc"]>(async (fn) =>
    fn === "claim_booking_alerts" ? (claim as Awaited<ReturnType<Deps["rpc"]>>) : { ok: true, data: { ok: true } });
  const sent: Email[] = [];
  const send = vi.fn<Deps["send"]>(async (email) => { sent.push(email); return sends.shift() ?? { ok: true, id: "re_1" }; });
  const sleep = vi.fn<Deps["sleep"]>(async () => {});
  return { rpc, send, sleep, sent, d: { rpc, send, sleep, now: () => NOW } satisfies Deps };
}

describe("a run", () => {
  it("sends each claimed alert and records each outcome", async () => {
    const t = deps(
      { ok: true, data: { ok: true, alerts: [alert(), alert({ id: "al-2", kind: "remind_2h" })] } },
      [{ ok: true, id: "re_a" }, { ok: false, error: "Resend 429: rate limited" }],
    );
    const r = await runAlerts("s3cret", t.d);
    expect(r).toEqual({ status: 200, body: { ok: true, due: 2, sent: 1, failed: ["remind_2h CB-7KM4Q: Resend 429: rate limited"] } });
    expect(t.rpc).toHaveBeenCalledWith("claim_booking_alerts", { p_secret: "s3cret", p_limit: 5 });
    expect(t.rpc).toHaveBeenCalledWith("finish_booking_alert", { p_secret: "s3cret", p_alert_id: "al-1", p_ok: true, p_detail: "re_a" });
    expect(t.rpc).toHaveBeenCalledWith("finish_booking_alert", {
      p_secret: "s3cret", p_alert_id: "al-2", p_ok: false, p_detail: "Resend 429: rate limited",
    });
    // Resend's free plan takes two a second
    expect(t.sleep).toHaveBeenCalledTimes(1);
  });

  it("records a send that threw as failed, so the next run retries it", async () => {
    const t = deps({ ok: true, data: { ok: true, alerts: [alert()] } });
    t.send.mockRejectedValueOnce(new Error("socket hang up"));
    const r = await runAlerts("s3cret", t.d);
    expect(r.body).toMatchObject({ sent: 0, failed: ["new CB-7KM4Q: socket hang up"] });
    expect(t.rpc).toHaveBeenCalledWith("finish_booking_alert", expect.objectContaining({ p_ok: false, p_detail: "socket hang up" }));
  });

  it("refuses a caller without the right secret and sends nothing", async () => {
    const t = deps({ ok: true, data: { ok: false, error: "bad_secret" } });
    expect(await runAlerts("guess", t.d)).toEqual({ status: 401, body: { ok: false, error: "bad_secret" } });
    expect(t.send).not.toHaveBeenCalled();
  });

  // The failure that would otherwise look like a quiet day.
  it("reports a claim that failed as a failure, never as nothing due", async () => {
    const t = deps({ ok: false, error: "claim_booking_alerts answered 404: Could not find the function" });
    const r = await runAlerts("s3cret", t.d);
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ ok: false, error: "claim_booking_alerts answered 404: Could not find the function" });
    expect(t.send).not.toHaveBeenCalled();
  });

  it("says the database has no secret yet when it hasn't", async () => {
    const t = deps({ ok: true, data: { ok: false, error: "not_configured" } });
    expect(await runAlerts("s3cret", t.d)).toEqual({ status: 503, body: { ok: false, error: "not_configured" } });
  });

  it("is a quiet 200 when nothing is due", async () => {
    const t = deps({ ok: true, data: { ok: true, alerts: [] } });
    expect(await runAlerts("s3cret", t.d)).toEqual({ status: 200, body: { ok: true, due: 0, sent: 0, failed: [] } });
  });
});

describe("the endpoint", () => {
  function call(method: string, headers: Record<string, string> = {}) {
    let status = 0;
    let body: unknown;
    const res = { status: (c: number) => { status = c; return { json: (b: unknown) => { body = b; } }; } };
    return handler({ method, headers }, res).then(() => ({ status, body }));
  }

  it("takes POST only", async () => {
    expect((await call("GET")).status).toBe(405);
  });

  it("names what is missing, and only the names", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const r = await call("POST", { authorization: "Bearer x" });
    expect(r).toEqual({ status: 501, body: { ok: false, error: "Not configured: RESEND_API_KEY" } });
    vi.unstubAllEnvs();
  });

  it("turns away a call with no secret before touching anything", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await call("POST")).toEqual({ status: 401, body: { ok: false, error: "bad_secret" } });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("asks the database with the public key and the caller's secret", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, alerts: [] }), { status: 200 }),
    );
    const r = await call("POST", { authorization: "Bearer the-db-secret" });
    expect(r).toEqual({ status: 200, body: { ok: true, due: 0, sent: 0, failed: [] } });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test.supabase.co/rest/v1/rpc/claim_booking_alerts");
    expect((init.headers as Record<string, string>).apikey).toBe("test-anon-key");
    expect(JSON.parse(init.body as string)).toEqual({ p_secret: "the-db-secret", p_limit: 5 });
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
  });
});
