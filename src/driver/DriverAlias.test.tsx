import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import DriverAlias from "./DriverAlias";

function Where() {
  const { pathname, search, hash } = useLocation();
  return <p data-testid="at">{pathname + search + hash}</p>;
}

const at = (start: string) => {
  render(
    <MemoryRouter initialEntries={[start]}>
      <Routes>
        <Route path="/driver/*" element={<DriverAlias />} />
        <Route path="/drive/*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId("at").textContent;
};

describe("/driver", () => {
  it("opens the driver portal", () => {
    expect(at("/driver")).toBe("/drive");
  });
  it("keeps the rest of the path, the query and the hash", () => {
    expect(at("/driver/history?week=2#top")).toBe("/drive/history?week=2#top");
  });
});
