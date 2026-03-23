import { Link } from "wouter";
import { UtensilsCrossed, MapPin, Phone, Mail, Clock } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-card border-t border-border pt-16 pb-8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          
          {/* Brand */}
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-6">
              <UtensilsCrossed className="w-6 h-6 text-primary" />
              <span className="font-serif text-xl font-bold tracking-wider text-foreground">
                Lucias Küche
              </span>
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6">
              Bringing the warmth, tradition, and rich flavors of authentic European family kitchens right to your table.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-serif text-lg font-semibold mb-6">Explore</h4>
            <ul className="space-y-4">
              <li>
                <Link href="/" className="text-muted-foreground hover:text-primary transition-colors">Home</Link>
              </li>
              <li>
                <Link href="/menu" className="text-muted-foreground hover:text-primary transition-colors">Our Menu</Link>
              </li>
              <li>
                <Link href="/about" className="text-muted-foreground hover:text-primary transition-colors">Our Story</Link>
              </li>
              <li>
                <Link href="/reservations" className="text-muted-foreground hover:text-primary transition-colors">Reservations</Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-serif text-lg font-semibold mb-6">Contact</h4>
            <ul className="space-y-4 text-muted-foreground text-sm">
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-primary shrink-0 mt-1" />
                <span>123 Culinary Lane<br/>Gourmet District, Berlin 10115</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-primary shrink-0" />
                <span>+49 30 1234 5678</span>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-primary shrink-0" />
                <span>gutenappetit@luciaskueche.de</span>
              </li>
            </ul>
          </div>

          {/* Hours */}
          <div>
            <h4 className="font-serif text-lg font-semibold mb-6">Opening Hours</h4>
            <ul className="space-y-4 text-muted-foreground text-sm">
              <li className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Tue - Thu</p>
                  <p>17:00 - 22:30</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-4 h-4 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Fri - Sun</p>
                  <p>12:00 - 23:00</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-4 h-4 shrink-0" />
                <div>
                  <p className="font-medium text-primary">Monday Closed</p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} Lucias Küche. All rights reserved.
          </p>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
