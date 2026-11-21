import { clearAiKey } from "@/lib/aiKey";
import { forgetDeviceData } from "@/lib/session/deviceData";

jest.mock("../../../lib/aiKey", () => ({ clearAiKey: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe("forgetDeviceData", () => {
  it("removes the account's scoped entries and its AI key, and nothing else", async () => {
    localStorage.setItem("circadium.onboarding.progress.user-1", "{\"dumpItems\":[]}");
    localStorage.setItem("circadium.onboarding.progress.user-2", "{}");
    localStorage.setItem("theme.dark.user-1", "1");
    localStorage.setItem("circadium.sidebar.collapsed", "1");

    await forgetDeviceData("user-1");

    expect(localStorage.getItem("circadium.onboarding.progress.user-1")).toBeNull();
    expect(localStorage.getItem("circadium.onboarding.progress.user-2")).toBe("{}");
    expect(localStorage.getItem("theme.dark.user-1")).toBe("1");
    expect(localStorage.getItem("circadium.sidebar.collapsed")).toBe("1");
    expect(clearAiKey).toHaveBeenCalledWith("user-1");
  });

  it("does not take a key that merely ends in the same characters", async () => {
    localStorage.setItem("circadium.layout.v1", "x");

    await forgetDeviceData("1");

    expect(localStorage.getItem("circadium.layout.v1")).toBe("x");
  });
});
