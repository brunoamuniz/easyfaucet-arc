import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  metadataBase: new URL("https://easyfaucetarc.xyz"),
  title: "Easy Faucet Arc - Get 100 USDC Testnet Tokens",
  description:
    "Get up to 100 USDC (testnet) per day to develop on the ARC Network. Better than the official faucet that only provides 1 USDC per hour.",
  keywords: ["ARC Network", "Testnet", "USDC", "Faucet", "DeFi", "Web3", "Blockchain"],
  authors: [{ name: "Easy Faucet Arc" }],
  creator: "Easy Faucet Arc",
  publisher: "Easy Faucet Arc",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [
      {
        url: "/favicon.svg",
        type: "image/svg+xml",
      },
      {
        url: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://easyfaucetarc.xyz",
    siteName: "Easy Faucet Arc",
    title: "Easy Faucet Arc - Get 100 USDC Testnet Tokens",
    description:
      "Get up to 100 USDC (testnet) per day to develop on the ARC Network. Better than the official faucet that only provides 1 USDC per hour.",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Easy Faucet Arc - ARC Testnet Faucet",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Easy Faucet Arc - Get 100 USDC Testnet Tokens",
    description:
      "Get up to 100 USDC (testnet) per day to develop on the ARC Network. Better than the official faucet that only provides 1 USDC per hour.",
    images: ["/og-image.svg"],
    creator: "@ARC",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

