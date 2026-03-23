import { Link } from "wouter";
import { UtensilsCrossed } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
      <div className="max-w-md">
        <UtensilsCrossed className="w-16 h-16 text-primary/40 mx-auto mb-6" />
        <h1 className="text-5xl font-serif font-bold text-foreground mb-4">404</h1>
        <h2 className="text-2xl font-serif text-foreground mb-4">Page Not Found</h2>
        <p className="text-muted-foreground mb-8">
          It looks like this dish isn't on the menu. The page you're looking for doesn't exist or has been moved.
        </p>
        <Link 
          href="/"
          className="inline-block px-8 py-3 bg-primary text-primary-foreground font-bold tracking-widest uppercase rounded-sm hover:bg-primary/90 transition-colors duration-300"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
