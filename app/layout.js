import "./globals.css";
import Nav from "../components/Nav";

export const metadata = {
  title: "AccessLease",
  description: "Finds temporary access permissions that never expired",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
