import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import NocBadge from "../NocBadge";
import * as noc from "../../services/noc";

jest.spyOn(noc, "loadNoc").mockResolvedValue({
  source: "cache",
  cachedAt: new Date("2025-02-02T10:00:00Z").getTime(),
  meta: { last_checked: "2025-02-01" },
} as any);

it("renders last date", async () => {
  const { getByTestId } = render(<NocBadge />);
  await waitFor(() => {
    const el = getByTestId("noc-badge-text");
    const flat = (el.props.children as any[]).join("");
    expect(flat).toMatch(/\b2025-02-02\b/);
  });
});
