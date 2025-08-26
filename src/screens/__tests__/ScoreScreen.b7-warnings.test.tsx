// src/screens/__tests__/ScoreScreen.b7-warnings.test.tsx
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import ScoreScreen from "../ScoreScreen";

// --- Mocks (keep these lightweight and local to this spec) ---
jest.mock("../../components/PrimaryButton", () => {
  const React = require("react");
  const { Text, TouchableOpacity } = require("react-native");
  return ({ title, onPress, testID }: any) => (
    <TouchableOpacity onPress={onPress} testID={testID}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
});

jest.mock("../../components/RulesBadge", () => {
  const React = require("react");
  const { View } = require("react-native");
  return () => <View testID="mock-rules-badge" />;
});

jest.mock("../../services/rules", () => ({
  getRulesVersion: jest.fn(() => "test"),
}));

jest.mock("../../services/crs", () => ({
  calculateCrs: jest.fn(() => 0),
  getCrsVersion: jest.fn(() => "test"),
  primeCrsParams: jest.fn(() => Promise.resolve()),
  getCrsLastSynced: jest.fn(() => "local"),
  loadCRSSessionExtras: jest.fn(() => ({
    hasPNP: false,
    hasSibling: false,
    frenchCLB: 0,
    study: "none",
  })),
  saveCRSSessionExtras: jest.fn(),
  computeAdditionalCRS: jest.fn(() => 0),
  withAdditionalCRS: jest.fn((base: number) => ({ total: base })),
}));

jest.mock("../../services/fsw67", () => ({
  calculateFsw67: jest.fn(() => ({
    total: 0,
    pass: false,
    passMark: 67,
    classification: "Unlikely",
    version: "test",
    breakdown: {},
  })),
  getFswVersion: jest.fn(() => "test"),
  primeFswParams: jest.fn(() => Promise.resolve()),
  getFswLastSynced: jest.fn(() => "local"),
}));

jest.mock("@react-native-picker/picker", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  const Picker = ({ children, testID }: any) => <View testID={testID}>{children}</View>;
  (Picker as any).Item = ({ label }: any) => <Text>{label}</Text>;
  return { Picker };
});

// --- Helper: minimal navigation stub so addListener() works ---
const navStub = {
  addListener: jest.fn(() => jest.fn()),
};

describe("B7 — FSW eligibility warnings", () => {
  it("shows both warnings by default (bachelor + no Canadian study + no arranged employment)", async () => {
    const { getByTestId } = render(<ScoreScreen navigation={navStub as any} />);

    // Initial state in the screen: education = 'bachelor', adCanadianStudy=false, fswArranged=false
    expect(getByTestId("fsw-warning-eca")).toBeTruthy();
    expect(getByTestId("fsw-warning-pof")).toBeTruthy();
  });

  it("hides ECA warning when Canadian study is toggled ON", async () => {
    const { getByTestId, queryByTestId } = render(<ScoreScreen navigation={navStub as any} />);

    const studySwitch = getByTestId("sc-ad-study");
    fireEvent(studySwitch, "valueChange", true);

    await waitFor(() => {
      expect(queryByTestId("fsw-warning-eca")).toBeNull();
    });

    // PoF warning should still be visible (arranged=false by default)
    expect(getByTestId("fsw-warning-pof")).toBeTruthy();
  });

  it("hides PoF warning when arranged employment is toggled ON", async () => {
    const { getByTestId, queryByTestId } = render(<ScoreScreen navigation={navStub as any} />);

    const arrangedSwitch = getByTestId("sc-fsw-arranged");
    fireEvent(arrangedSwitch, "valueChange", true);

    await waitFor(() => {
      expect(queryByTestId("fsw-warning-pof")).toBeNull();
    });

    // ECA warning should still be visible (Canadian study=false by default)
    expect(getByTestId("fsw-warning-eca")).toBeTruthy();
  });

  it("hides both warnings when Canadian study=ON and Arranged employment=ON", async () => {
    const { getByTestId, queryByTestId } = render(<ScoreScreen navigation={navStub as any} />);

    fireEvent(getByTestId("sc-ad-study"), "valueChange", true);      // hides ECA
    fireEvent(getByTestId("sc-fsw-arranged"), "valueChange", true);  // hides PoF

    await waitFor(() => {
      expect(queryByTestId("fsw-warning-eca")).toBeNull();
      expect(queryByTestId("fsw-warning-pof")).toBeNull();
    });
  });
});
