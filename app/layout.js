import "./globals.css";

export const metadata = {
  title: "Hackathon Starter",
  description: "Next.js + AI starter ready for Vercel",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
