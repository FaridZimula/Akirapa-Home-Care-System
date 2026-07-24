import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#59336d",
};

export const metadata: Metadata = {
  title: "Akirapa Home Care | In-Home Care Management",
  description: "Professional, certified in-home caregivers providing personalized elderly care, childcare, and disability support. Secure HIPAA-compliant family portal with real-time updates.",
  keywords: "home care, healthcare, elderly care, childcare, disability support, caregivers, in-home care, senior care, Akirapa",
  authors: [{ name: "Akirapa Home Care" }],
  manifest: "/manifest.json",
  openGraph: {
    title: "Akirapa Home Care - In-Home Care Management",
    description: "Professional, certified in-home caregivers providing personalized care for your loved ones.",
    url: "https://akirapa.com",
    siteName: "Akirapa Home Care",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Akirapa Home Care",
    description: "Compassionate, professional in-home care services.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap" 
          rel="stylesheet" 
        />
        <link 
          rel="stylesheet" 
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" 
          integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" 
          crossOrigin="anonymous" 
          referrerPolicy="no-referrer" 
        />
      </head>
      <body className="bg-gray-50 text-gray-900 font-sans antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}