// src/services/ita.ts
import { Alert, Platform } from "react-native";
import type { EECheck } from "./eeProfile";
import { getEEChecklist, applyFix } from "./eeProfile";

/** Items that must be strictly "ok" before entering e-APR */
const REQUIRED_IDS = new Set<EECheck["id"]>([
  "eca_selected",
  "language_booked",
  "pof_adequate",
  "noc_verified",
]);

export type ITAReadinessResult = {
  ready: boolean;
  blockers: EECheck[];
  all: EECheck[];
};

/** Collect readiness state + blocking checks */
export async function checkReadiness(): Promise<ITAReadinessResult> {
  const all = await getEEChecklist();
  const blockers = all.filter(
    (c) => REQUIRED_IDS.has(c.id) && c.status !== "ok"
  );
  return { ready: blockers.length === 0, blockers, all };
}

/** Human-friendly list for alert body */
export function formatBlockers(blockers: EECheck[]): string {
  if (!blockers.length) return "All set.";
  const lines = blockers.map((b) => {
    const title = b.title || b.id;
    const details = (b.details || "").toString().trim();
    return `• ${title}${details ? ` — ${details}` : ""}`;
  });
  return lines.join("\n");
}

/** Web-safe alert (RN Web sometimes ignores Alert.alert) */
function showBlockerAlert(
  message: string,
  onFix: () => void,
  onChecklist: () => void
) {
  if (Platform.OS === "web") {
    // Minimal, guaranteed UI on web
    // eslint-disable-next-line no-alert
    const choice = window.confirm(
      `Not ready for e-APR:\n\n${message}\n\nPress OK to Fix now, or Cancel to open the Checklist.`
    );
    if (choice) {
      onFix();
    } else {
      onChecklist();
    }
    return;
  }

  Alert.alert(
    "Not ready for e-APR",
    message,
    [
      { text: "Fix now", onPress: onFix },
      { text: "Checklist", onPress: onChecklist },
      { text: "Cancel", style: "cancel" },
    ],
    { cancelable: true }
  );
}

/**
 * Hard gate into the e-APR builder.
 * If ready → navigates to destination.
 * If blocked → shows a web-safe dialog with Fix / Checklist options.
 *
 * @param navigation React Navigation object
 * @param destination Route name (default: "EAPRBuilder")
 */
export async function gateToEAPR(
  navigation: any,
  destination: string = "EAPRBuilder"
): Promise<boolean> {
  const { ready, blockers } = await checkReadiness();

  if (ready) {
    navigation.navigate(destination);
    return true;
  }

  const top = blockers[0];
  const message = formatBlockers(blockers);

  const onFix = async () => {
    await applyFix(top.fix, (route: string, params?: any) =>
      navigation.navigate(route, params)
    );
  };

  const onChecklist = () => navigation.navigate("EEProfileChecklist");

  showBlockerAlert(message, onFix, onChecklist);
  return false;
}
