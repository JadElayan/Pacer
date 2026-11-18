import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/** The Pacer logo centered on a white rounded square, for home-screen and app icons. */
export async function appIcon(size: number) {
  const svg = await readFile(join(process.cwd(), "public", "logo.svg"));
  const src = `data:image/svg+xml;base64,${svg.toString("base64")}`;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={src} width={Math.round(size * .46)} height={Math.round(size * .57)} />
    </div>,
    { width: size, height: size },
  );
}
