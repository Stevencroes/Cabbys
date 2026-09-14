// One AdminRide, one driver and one board, for tests to bend.
//
// AdminRide carries twenty-six fields, and before this every test file
// that needed one listed all of them. Three copies of the same object
// literal is three places to update when a column is added, and the
// compiler only catches the ones that are actually wrong — a test that
// still compiles with a stale default is a test that quietly stopped
// covering what its name says.
//
// So: one shape, one set of defaults, and each test overrides the two or
// three fields it is actually about. The defaults describe a perfectly
// ordinary booking — an airport run, confirmed, nobody driving it yet —
// because the most common thing a test needs to say is "a normal ride,
// except…".
//
// Not imported by anything that renders. It lives beside the library it
// builds a value for so the two cannot drift apart.
import type { AdminRide } from "./admin";
import type { DriverProfile } from "../../driver/lib/driver";
import type { Board } from "../BoardContext";

export function makeRide(over: Partial<AdminRide> = {}): AdminRide {
  return {
    id: "r1",
    status: "confirmed",
    scheduledAt: "2026-09-01T18:35:00.000Z",
    pickup: "Queen Beatrix International Airport",
    dropoff: "The Ritz-Carlton Aruba",
    vehicle: "The Scout",
    passengers: 3,
    luggage: 2,
    childSeats: 0,
    // ƒ89.50 is what the guest pays — $50, not the driver's $37.50 cut
    fareAwg: 89.5,
    bookingRef: "CB-1",
    guestName: "Marta Vos",
    guestPhone: "+31 6 1234 5678",
    flightNumber: null,
    driverId: null,
    driverName: null,
    driverPhone: null,
    driverVehicle: null,
    driverPlate: null,
    guestEmail: null,
    passengerId: null,
    paymentStatus: null,
    createdAt: "2026-08-20T10:00:00.000Z",
    assignedAt: null,
    arrivedAt: null,
    startedAt: null,
    completedAt: null,
    notes: null,
    pickupLat: null,
    pickupLng: null,
    ...over,
  };
}

/**
 * One driver, likewise.
 *
 * The defaults describe somebody a guest could actually pick out at a
 * kerb — name, plate, photo, approved — because most tests are about
 * what happens when one of those is MISSING, and saying so by removing
 * a field reads better than assembling a whole person to say nothing.
 */
export function makeDriver(over: Partial<DriverProfile> = {}): DriverProfile {
  return {
    id: "d1",
    fullName: "Ana Croes",
    email: null,
    phone: "+297 560 1234",
    vehicle: null,
    plate: "A-12345",
    make: "Mercedes",
    model: "V-Class",
    colour: "Black",
    year: 2024,
    seats: 6,
    bags: 5,
    photoUrl: "https://example.test/face.jpg",
    status: "approved",
    rating: 4.9,
    tripsCount: 128,
    isOnline: false,
    ...over,
  };
}

/**
 * A whole board, for the screens that read one.
 *
 * Eight screens take their rides, drivers and paperwork from
 * <BoardProvider> rather than fetching their own, so a screen test
 * mocks the context rather than the Supabase client — which is the
 * right seam anyway: these tests are about what an operator is SHOWN,
 * and the loaders have their own tests in admin.test.ts.
 *
 * Empty and error-free by default, because "a quiet board" is the state
 * most tests start from and then add one wrong thing to.
 */
export function makeBoard(over: Partial<Board> = {}): Board {
  return {
    rides: [],
    ridesError: null,
    drivers: [],
    driversError: null,
    docs: new Map(),
    docsError: null,
    loading: false,
    attention: [],
    unassigned: 0,
    refresh: () => Promise.resolve(),
    ...over,
  };
}
