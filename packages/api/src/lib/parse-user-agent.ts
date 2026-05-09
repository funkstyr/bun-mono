import { UAParser } from "ua-parser-js";

const UNKNOWN = "Unknown";

export type ParsedUserAgent = {
  device: string;
  browser: string;
  os: string;
};

export function parseUserAgent(ua: string | null): ParsedUserAgent {
  if (!ua) {
    return { device: UNKNOWN, browser: UNKNOWN, os: UNKNOWN };
  }

  try {
    const result = new UAParser(ua).getResult();
    const browserName = result.browser.name;
    const osName = result.os.name;
    const { type: deviceType, vendor, model } = result.device;

    let device: string;
    if (vendor && model) {
      device = `${vendor} ${model}`;
    } else if (model) {
      device = model;
    } else if (deviceType) {
      device = deviceType.charAt(0).toUpperCase() + deviceType.slice(1);
    } else if (browserName || osName) {
      device = "Desktop";
    } else {
      device = UNKNOWN;
    }

    return {
      device,
      browser: browserName || UNKNOWN,
      os: osName || UNKNOWN,
    };
  } catch {
    return { device: UNKNOWN, browser: UNKNOWN, os: UNKNOWN };
  }
}
