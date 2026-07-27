import {
  getWebPushStatusKey,
  isWebPushActiveOnDevice,
} from "../Notifications";

describe("Notifications Web Push preference state", () => {
  const walletPreference = {
    category: "wallet",
    inAppEnabled: true,
    pushEnabled: true,
  };

  it("does not show Web Push as active until this browser has a subscription", () => {
    const webPushState = {
      isSupported: true,
      permission: "default",
      subscriptionEndpoint: null,
      loading: false,
    };

    expect(isWebPushActiveOnDevice(walletPreference, webPushState)).toBe(false);
    expect(getWebPushStatusKey(webPushState, false)).toBe("permissionRequired");
  });

  it("shows Web Push as active only when permission and subscription exist", () => {
    const webPushState = {
      isSupported: true,
      permission: "granted",
      subscriptionEndpoint: "https://push.example/subscription",
      loading: false,
    };

    expect(isWebPushActiveOnDevice(walletPreference, webPushState)).toBe(true);
    expect(getWebPushStatusKey(webPushState, true)).toBe("active");
  });

  it("keeps unsupported devices inactive even when the backend preference is enabled", () => {
    const webPushState = {
      isSupported: false,
      permission: "unsupported",
      subscriptionEndpoint: null,
      loading: false,
    };

    expect(isWebPushActiveOnDevice(walletPreference, webPushState)).toBe(false);
    expect(getWebPushStatusKey(webPushState, false)).toBe("unsupported");
  });
});
