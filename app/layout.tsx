import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const title = "LessonCue — Media ready when the lesson starts";
  const description = "Plan dated lessons, prepare media for offline playback, and keep every classroom screen ready.";

  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1730, height: 909, alt: "LessonCue — Media ready when the lesson starts" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
