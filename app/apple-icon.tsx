import { appIcon } from "@/lib/appIcon";

// iPad and iPhone use this when Pacer is added to the home screen.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(180);
}
