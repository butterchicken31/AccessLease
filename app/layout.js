
import "./globals.css";
import Nav from "../components/Nav";
import Logo from "../components/Logo";

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
        <footer className="footer">
          <Logo size={22} />
          <span>
            AccessLease · Code-e-Manipal 2.0 · Cybersecurity · mock data only,
            no real accounts
          </span>
        </footer>
      </body>
    </html>
  );
}
