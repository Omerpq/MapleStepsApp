// Ensure long renders don’t time out in CI
jest.setTimeout(20000);

// Make ScoreScreen’s async priming resolve immediately in tests
jest.mock("../../services/crs", () => {
  const actual = jest.requireActual("../../services/crs");
  return {
    ...actual,
    primeCrsParams: jest.fn(() => Promise.resolve()),
    getCrsLastSynced: jest.fn(() => "local"),
  };
});

jest.mock("../../services/fsw67", () => {
  const actual = jest.requireActual("../../services/fsw67");
  return {
    ...actual,
    primeFswParams: jest.fn(() => Promise.resolve()),
    getFswLastSynced: jest.fn(() => "local"),
  };
});

// ---- Mocks must come first ----
jest.mock("expo", () => ({}), { virtual: true });
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }), { virtual: true });

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);


// Stop background loaders from creating timers/listeners in tests
jest.mock("../../services/fsw67", () => {
  const actual = jest.requireActual("../../services/fsw67");
  return {
    ...actual,
    primeFswParams: jest.fn().mockResolvedValue(undefined),
    // optional: stable values if UI reads these
    getFswSource: jest.fn(() => "local"),
    getFswCachedAt: jest.fn(() => Date.now()),
  };
});

jest.mock("../../services/crs", () => {
  const actual = jest.requireActual("../../services/crs");
  return {
    ...actual,
    primeCrsParams: jest.fn().mockResolvedValue(undefined),
  };
});

// Mock navigation so addListener exists & fires once
jest.mock("@react-navigation/native", () => {
  return {
    useNavigation: () => ({
      navigate: jest.fn(),
      addListener: jest.fn().mockImplementation((event: string, cb: () => void) => {
        if (event === "focus" && typeof cb === "function") cb(); // simulate focus
        return jest.fn(); // unsubscribe
      }),
    }),
    useFocusEffect: () => {}, // no-op
  };
});

// Make Picker “fireable” via onValueChange in tests
jest.mock("@react-native-picker/picker", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Picker = ({ testID, onValueChange, children }: any) => (
    <View testID={testID} onValueChange={onValueChange}>
      {children}
    </View>
  );
  Picker.Item = () => null;
  return { Picker };
});

// Silence Animated warnings
jest.mock("react-native/Libraries/Animated/NativeAnimatedHelper", () => ({}), { virtual: true });

// ---- Now imports ----
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";

import QuickCheckScreen from "../QuickCheckScreen";
import ScoreScreen from "../ScoreScreen";

describe("FSW UI (QuickCheck & Score)", () => {
  test("QuickCheck: baseline 66 → 76 with arranged", async () => {
    const { getByTestId } = render(<QuickCheckScreen />);
    await act(async () => { await Promise.resolve(); }); // flush mount microtasks


    fireEvent.changeText(getByTestId("qc-age"), "29");
    fireEvent.changeText(getByTestId("qc-clb"), "9");
    fireEvent.changeText(getByTestId("qc-years"), "1");
    fireEvent(getByTestId("qc-education"), "onValueChange", "bachelor");
    fireEvent.press(getByTestId("qc-fsw-check"));
    expect(getByTestId("qc-fsw-result")).toHaveTextContent("FSW score 66 / 67");

    // arranged employment ON
    fireEvent(getByTestId("qc-arranged"), "valueChange", true);
    fireEvent.press(getByTestId("qc-fsw-check"));
    expect(getByTestId("qc-fsw-result")).toHaveTextContent("FSW score 76 / 67");
  });
test("Score screen: Adaptability points cap at +10", async () => {
  const mockNav = {
    navigate: jest.fn(),
    addListener: jest.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === "focus" && typeof cb === "function") cb(); // simulate focus
      return jest.fn(); // unsubscribe
    }),
  };

  const { getByTestId } = render(<ScoreScreen navigation={mockNav as any} />);
  await act(async () => { await Promise.resolve(); }); // flush mount microtasks

  // Shared inputs
  fireEvent.changeText(getByTestId("sc-age"), "29");
  fireEvent.changeText(getByTestId("sc-clb"), "9");
  fireEvent(getByTestId("sc-education"), "onValueChange", "bachelor");

  // FSW block inputs
  fireEvent.changeText(getByTestId("sc-fsw-years"), "1");

  // Ensure ALL Adaptability toggles are OFF + main arranged OFF
  fireEvent(getByTestId("sc-ad-spouse"), "valueChange", false);
  fireEvent(getByTestId("sc-ad-relative"), "valueChange", false);
  fireEvent(getByTestId("sc-ad-study"), "valueChange", false);
  fireEvent(getByTestId("sc-ad-arranged"), "valueChange", false);
  fireEvent(getByTestId("sc-ad-work1yr"), "valueChange", false);
  fireEvent(getByTestId("sc-fsw-arranged"), "valueChange", false);

  // Baseline
  fireEvent.press(getByTestId("sc-fsw-check"));
  expect(getByTestId("sc-fsw-result")).toHaveTextContent("Score 66 / 67");

  // Turn ON a +10 adaptability (Canadian skilled work 1+ yr)
  fireEvent(getByTestId("sc-ad-work1yr"), "valueChange", true);
  fireEvent.press(getByTestId("sc-fsw-check"));
  expect(getByTestId("sc-fsw-result")).toHaveTextContent("Score 76 / 67");

  // Turn ON three +5 items — total raw would be +25, but must cap at +10
  fireEvent(getByTestId("sc-ad-spouse"), "valueChange", true);
  fireEvent(getByTestId("sc-ad-relative"), "valueChange", true);
  fireEvent(getByTestId("sc-ad-study"), "valueChange", true);
  fireEvent.press(getByTestId("sc-fsw-check"));
  expect(getByTestId("sc-fsw-result")).toHaveTextContent("Score 76 / 67"); // still capped
});

  test("Score screen: baseline 66 → 76 with arranged", async () => {
  const mockNav = {
    navigate: jest.fn(),
    addListener: jest.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === "focus" && typeof cb === "function") cb(); // simulate focus
      return jest.fn(); // unsubscribe
    }),
  };

  
const { getByTestId } = render(<ScoreScreen navigation={mockNav as any} />);
await act(async () => { await Promise.resolve(); }); // flush mount microtasks

  // Shared inputs
  fireEvent.changeText(getByTestId("sc-age"), "29");
  fireEvent.changeText(getByTestId("sc-clb"), "9");
  fireEvent(getByTestId("sc-education"), "onValueChange", "bachelor");

  // FSW block inputs
  fireEvent.changeText(getByTestId("sc-fsw-years"), "1");

  // Ensure ALL Adaptability toggles are OFF for a clean baseline
  fireEvent(getByTestId("sc-ad-spouse"), "valueChange", false);
  fireEvent(getByTestId("sc-ad-relative"), "valueChange", false);
  fireEvent(getByTestId("sc-ad-study"), "valueChange", false);
  fireEvent(getByTestId("sc-ad-arranged"), "valueChange", false);
  fireEvent(getByTestId("sc-ad-work1yr"), "valueChange", false);

  // Baseline should be 66 / 67
  fireEvent.press(getByTestId("sc-fsw-check"));
  expect(getByTestId("sc-fsw-result")).toHaveTextContent("Score 66 / 67");

  // Turn ON the main (10-point) arranged employment, keep Adaptability arranged OFF
  fireEvent(getByTestId("sc-fsw-arranged"), "valueChange", true);
  fireEvent(getByTestId("sc-ad-arranged"), "valueChange", false);

  fireEvent.press(getByTestId("sc-fsw-check"));
  expect(getByTestId("sc-fsw-result")).toHaveTextContent("Score 76 / 67");
});
test("Parity: QuickCheck and Score show the same FSW total for identical inputs", async () => {
  // QuickCheck with: 29 / CLB 9 / Master’s / 3y exp / arranged OFF
  const qc = render(<QuickCheckScreen />);
  await act(async () => { await Promise.resolve(); });
  fireEvent.changeText(qc.getByTestId("qc-age"), "29");
  fireEvent.changeText(qc.getByTestId("qc-clb"), "9");
  fireEvent.changeText(qc.getByTestId("qc-years"), "3");
  fireEvent(qc.getByTestId("qc-education"), "onValueChange", "masters");
  fireEvent(qc.getByTestId("qc-arranged"), "valueChange", false);
  fireEvent.press(qc.getByTestId("qc-fsw-check"));
  expect(qc.getByTestId("qc-fsw-result")).toHaveTextContent(/FSW score \d+\s*\/\s*\d+/);


  // Score screen with the same inputs
  const mockNav = {
    navigate: jest.fn(),
    addListener: jest.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === "focus" && typeof cb === "function") cb();
      return jest.fn();
    }),
  };
  
  const sc = render(<ScoreScreen navigation={mockNav as any} />);
  await act(async () => { await Promise.resolve(); });
  fireEvent.changeText(sc.getByTestId("sc-age"), "29");
  fireEvent.changeText(sc.getByTestId("sc-clb"), "9");
  fireEvent(sc.getByTestId("sc-education"), "onValueChange", "masters");
  fireEvent.changeText(sc.getByTestId("sc-fsw-years"), "3");
  fireEvent(sc.getByTestId("sc-fsw-arranged"), "valueChange", false);
  // Ensure adaptability off (parity)
  fireEvent(sc.getByTestId("sc-ad-spouse"), "valueChange", false);
  fireEvent(sc.getByTestId("sc-ad-relative"), "valueChange", false);
  fireEvent(sc.getByTestId("sc-ad-study"), "valueChange", false);
  fireEvent(sc.getByTestId("sc-ad-arranged"), "valueChange", false);
  fireEvent(sc.getByTestId("sc-ad-work1yr"), "valueChange", false);
  fireEvent.press(sc.getByTestId("sc-fsw-check"));

  // Press the Score screen button
fireEvent.press(sc.getByTestId("sc-fsw-check"));

    // (Optional) sanity: result looks like "Score NN / 67"
    expect(sc.getByTestId("sc-fsw-result")).toHaveTextContent(/Score \d+\s*\/\s*\d+/);


  // Compare numeric totals by matching the first number in each result
  const pickNum = (el: any) => {
    const text = el.props?.children?.join?.("") ?? el.props?.children ?? "";
    const m = String(text).match(/\b(\d+)\s*\/\s*\d+\b/);
    return m ? Number(m[1]) : NaN;
  };
  const qcTotal = pickNum(qc.getByTestId("qc-fsw-result"));
  const scTotal = pickNum(sc.getByTestId("sc-fsw-result"));
  expect(Number.isNaN(qcTotal)).toBe(false);
  expect(qcTotal).toBe(scTotal);
});
test("CRS (B6) toggles do NOT change FSW result", async () => {
  const mockNav = {
    navigate: jest.fn(),
    addListener: jest.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === "focus" && typeof cb === "function") cb();
      return jest.fn();
    }),
  };

  const { getByTestId } = render(<ScoreScreen navigation={mockNav as any} />);
  await act(async () => { await Promise.resolve(); });

  // Shared inputs
  fireEvent.changeText(getByTestId("sc-age"), "29");
  fireEvent.changeText(getByTestId("sc-clb"), "9");
  fireEvent(getByTestId("sc-education"), "onValueChange", "bachelor");

  // FSW inputs
  fireEvent.changeText(getByTestId("sc-fsw-years"), "1");
  fireEvent(getByTestId("sc-fsw-arranged"), "valueChange", false);

  // Ensure Adaptability OFF (clean baseline)
  fireEvent(getByTestId("sc-ad-spouse"), "valueChange", false);
  fireEvent(getByTestId("sc-ad-relative"), "valueChange", false);
  fireEvent(getByTestId("sc-ad-study"), "valueChange", false);
  fireEvent(getByTestId("sc-ad-arranged"), "valueChange", false);
  fireEvent(getByTestId("sc-ad-work1yr"), "valueChange", false);

  // Baseline FSW
  fireEvent.press(getByTestId("sc-fsw-check"));
  expect(getByTestId("sc-fsw-result")).toHaveTextContent("Score 66 / 67");

  // === Flip B6 (CRS) inputs — FSW must NOT change ===

  // PNP ON
  fireEvent(getByTestId("sc-b6-pnp"), "valueChange", true);
  fireEvent.press(getByTestId("sc-fsw-check"));
  expect(getByTestId("sc-fsw-result")).toHaveTextContent("Score 66 / 67");

  // Sibling ON
  fireEvent(getByTestId("sc-b6-sibling"), "valueChange", true);
  fireEvent.press(getByTestId("sc-fsw-check"));
  expect(getByTestId("sc-fsw-result")).toHaveTextContent("Score 66 / 67");

  // French CLB -> 7
  fireEvent.changeText(getByTestId("sc-b6-french-clb"), "7");
  fireEvent.press(getByTestId("sc-fsw-check"));
  expect(getByTestId("sc-fsw-result")).toHaveTextContent("Score 66 / 67");

  // Reset B6
  fireEvent(getByTestId("sc-b6-pnp"), "valueChange", false);
  fireEvent(getByTestId("sc-b6-sibling"), "valueChange", false);
  fireEvent.changeText(getByTestId("sc-b6-french-clb"), "0");
  fireEvent.press(getByTestId("sc-fsw-check"));
  expect(getByTestId("sc-fsw-result")).toHaveTextContent("Score 66 / 67");
});

});
