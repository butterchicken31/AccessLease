
import "./globals.css";
import Nav from "../components/Nav";
import Logo from "../components/Logo";
import Assistant from "../components/Assistant";
import { ThemeProvider } from "../components/ThemeProvider";

export const metadata = {
  title: "AccessLease",
  description: "Finds temporary access permissions that never expired",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <Nav />
          <main>{children}</main>
          <Assistant />
          <footer className="footer">
            <Logo size={22} />
            <span>
              AccessLease · Code-e-Manipal 2.0 · Cybersecurity · mock data only,
              no real accounts
            </span>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
