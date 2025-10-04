/**
 * EAPRBuilder tests:
 * 1) Validate with all required docs provided → no "Missing" banner rendered
 * 2) Toggle a required pill off → validation triggers Alert("Missing items", ...)
 */
import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";

// ---- Mocks ---------------------------------------------------------------
jest.mock("../../services/eapr", () => {
  const guide = {
    id: "eapr",
    title: "e-APR Document Pack",
    sections: [
      { id: "personal", title: "Personal", docs: [{ id: "passport", title: "Passport", required: true }] },
      { id: "photos_sign", title: "Photos & Sign", docs: [{ id: "photo", title: "Photo", required: true }] },
    ],
  };
  let state = {
    items: {
      personal: { passport: { provided: true } },
      photos_sign: { photo: { provided: true } },
    },
  };
  return {
    loadEaprGuides: jest.fn().mockResolvedValue({
      guide,
      meta: { source: "remote", status: 200, fetchedAtISO: new Date().toISOString(), __cachedAt: new Date().toISOString() },
    }),
    getPackState: jest.fn().mockResolvedValue(state),
    markProvided: jest.fn(async (_s: string, _d: string, val: boolean) => {
      state = { ...state, items: { ...state.items, personal: { ...state.items.personal, passport: { provided: val } } } };
      return state;
    }),
    updateDocInfo: jest.fn(async () => state),
    validatePack: jest.fn((_guide, st) => {
      const issues: any[] = [];
      if (!st.items.personal.passport?.provided) issues.push({ sectionId: "personal", title: "Passport", message: "Required" });
      if (!st.items.photos_sign.photo?.provided) issues.push({ sectionId: "photos_sign", title: "Photo", message: "Required" });
      return issues;
    }),
  };
});

jest.mock("../../services/irccLive", () => ({
  loadIrccLiveMeta: jest.fn().mockResolvedValue({ verifiedAtISO: new Date().toISOString(), links: [], source: "live" }),
}));

// Import AFTER mocks
import EAPRBuilder from "../../screens/EAPRBuilder";

// ---- Tests ---------------------------------------------------------------
describe("EAPRBuilder", () => {
  it('Validate → no "Missing" banner', async () => {
    render(<EAPRBuilder />);
    const validateBtn = await screen.findByText(/Validate required documents/i);
    fireEvent.press(validateBtn);
    expect(screen.queryByText(/Missing/i)).toBeNull();
  });

  it('Toggle required pill → Alert("Missing items", ...)', async () => {
    // Spy on RN Alert
    const { Alert } = require("react-native");
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    render(<EAPRBuilder />);

    // Reveal pills
    const expandAll = await screen.findByText(/Expand all/i);
    fireEvent.press(expandAll);

    // Toggle a required pill to incomplete
    const passportPill = await screen.findByText(/Passport/i);
    fireEvent.press(passportPill);

    // Validate — should trigger Alert("Missing items", ...)
    const validateBtn = await screen.findByText(/Validate required documents/i);
    fireEvent.press(validateBtn);

    expect(alertSpy).toHaveBeenCalled();
    const titles = alertSpy.mock.calls.map((c: any[]) => c[0]);
    expect(titles).toContain("Missing items");

    alertSpy.mockRestore();
  });
});
