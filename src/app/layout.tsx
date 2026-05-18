import type { Metadata } from "next";
import { Bebas_Neue, Rajdhani } from "next/font/google";
import "./globals.css";
import { SharedElementProvider } from "@/components/ui/shared-element-provider";

const heading = Bebas_Neue({
  variable: "--font-heading",
  weight: "400",
  subsets: ["latin"],
});

const body = Rajdhani({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GymBro",
  description: "Gym companion app with 5/3/1 and smart plate loading",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${heading.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SharedElementProvider>
          {children}
        </SharedElementProvider>
      </body>
    </html>
  );
}
