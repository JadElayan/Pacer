import type { MetadataRoute } from "next";

/** Lets Pacer be installed ("Add to Home Screen") and open full screen like an app, on tablets especially. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pacer",
    short_name: "Pacer",
    description: "The classroom, in sync. One lesson, with every student moving through it their own way.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fdfcfc",
    theme_color: "#2454e8",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
