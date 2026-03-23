import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Home", path: "/" },
    { name: "Menu", path: "/menu" },
    { name: "Our Story", path: "/about" },
    { name: "Reservations", path: "/reservations" },
  ];

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out",
        isScrolled
          ? "bg-background/95 backdrop-blur-md shadow-sm py-3"
          : "bg-transparent py-5"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <UtensilsCrossed className={cn(
              "w-8 h-8 transition-colors duration-300",
              isScrolled ? "text-primary" : "text-primary drop-shadow-md"
            )} />
            <span className={cn(
              "font-serif text-2xl font-bold tracking-wider",
              isScrolled ? "text-foreground" : "text-foreground drop-shadow-sm"
            )}>
              Lucias Küche
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.path}
                className={cn(
                  "font-sans text-sm tracking-widest uppercase transition-colors duration-200 rustic-underline",
                  location === link.path
                    ? "text-primary font-bold"
                    : isScrolled
                    ? "text-foreground hover:text-primary"
                    : "text-foreground hover:text-primary" // Assuming light hero background. If hero is very dark, this logic would need tweaking to text-white
                )}
              >
                {link.name}
              </Link>
            ))}
            <Link
              href="/reservations"
              className={cn(
                "px-6 py-2.5 border border-primary text-primary text-sm font-bold tracking-widest uppercase rounded-sm transition-all duration-300 hover:bg-primary hover:text-white",
                location === '/reservations' && "bg-primary text-white"
              )}
            >
              Book a Table
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-background shadow-lg border-t border-border animate-in slide-in-from-top-2">
          <div className="flex flex-col py-4 px-4 gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.path}
                className={cn(
                  "block py-2 text-lg font-serif border-b border-border/50",
                  location === link.path ? "text-primary font-bold" : "text-foreground"
                )}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
