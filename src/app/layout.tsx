import type { Metadata } from "next";
import { IBM_Plex_Sans, Bricolage_Grotesque } from "next/font/google";
import { PointerLight } from "@/components/motion/PointerLight";
import "./globals.css";

const ibmPlex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export const metadata: Metadata = {
  title: "Facturador GDT DevSur",
  description: "Facturación electrónica — GDT DevSur",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <body className={`${ibmPlex.variable} ${bricolage.variable} font-sans antialiased`}>
        <PointerLight />
        {children}
      </body>
    </html>
  );
}
