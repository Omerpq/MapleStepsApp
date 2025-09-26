// src/screens/__tests__/ActionPlan.paywall.test.tsx
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import ActionPlanScreen from "../ActionPlanScreen";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "ms.tasks.v1";
const VIEWMODE_KEY = "ms.tasks.viewmode.v1";
const nowISO = new Date().toISOString();

// Use a mock-prefixed var so Jest allows it in the mock factory
const mockNavigate = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    addListener: jest.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === "focus" && typeof cb === "function") cb(); // simulate focus
      return jest.fn(); // unsubscribe
    }),
  }),
  useFocusEffect: () => {},
}));

describe("Action Plan → Paywall gating", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Seed ONE Premium task (no deps → not blocked)
    const tasks = [
      {
        id: "p1__i1",
        title: "【Premium】 Test Premium Task",
        baseISO: nowISO,
        offsetDays: 0,
        dueISO: nowISO,
        done: false,
      },
    ];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    await AsyncStorage.setItem(VIEWMODE_KEY, "due");
  });

  it("Unsubscribed: tapping a Premium row opens Paywall", async () => {
    const { getByLabelText } = render(<ActionPlanScreen />);
    await act(async () => { await Promise.resolve(); });

    const openBtn = getByLabelText("Open: Test Premium Task");
    fireEvent.press(openBtn);

    expect(mockNavigate).toHaveBeenCalledWith("Paywall", { from: "p1__i1" });
  });

  it("Subscribed: tapping a Premium row opens the real destination (not Paywall)", async () => {
    const { getByText, getByLabelText } = render(<ActionPlanScreen />);
    await act(async () => { await Promise.resolve(); });

    // In dev builds, the screen shows a chip to toggle premium.
    // Default label is "Premium OFF" → press to turn subscription ON.
    const toggle = getByText("Premium OFF");
    fireEvent.press(toggle);

    const openBtn = getByLabelText("Open: Test Premium Task");
    fireEvent.press(openBtn);

    // With subscription ON, gate should NOT send to Paywall.
    expect(mockNavigate).not.toHaveBeenCalledWith("Paywall", expect.anything());

    // Our seeded task isn't in the seed JSON, so it has no routeHint.
    // goToTask falls back to focusing the task on ActionPlan.
    expect(mockNavigate).toHaveBeenCalledWith("ActionPlan", { focusTaskId: "p1__i1" });
  });
});
