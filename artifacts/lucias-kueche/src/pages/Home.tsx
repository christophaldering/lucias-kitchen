import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Star, Wine, Coffee, Utensils } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
            alt="Lucias Küche Rustic Kitchen"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/70 to-transparent dark:from-background dark:via-background/80 dark:to-background/40"></div>
        </div>

        <div className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-2xl"
          >
            <span className="inline-block py-1 px-3 rounded-full bg-primary/10 text-primary font-bold tracking-widest text-xs uppercase mb-6">
              Welcome to our table
            </span>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-serif font-bold text-foreground leading-tight mb-6">
              Authentic flavors, <br />
              <span className="italic text-primary">crafted with love.</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-lg leading-relaxed">
              Experience the warmth of a traditional family kitchen. Every dish at Lucias Küche tells a story of heritage, fresh ingredients, and culinary passion.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link 
                href="/reservations" 
                className="px-8 py-4 bg-primary text-primary-foreground font-semibold rounded-sm shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 transition-all duration-300 text-center"
              >
                Book a Table
              </Link>
              <Link 
                href="/menu" 
                className="px-8 py-4 bg-card text-foreground border border-border font-semibold rounded-sm hover:border-primary hover:text-primary transition-all duration-300 flex items-center justify-center gap-2"
              >
                Explore Menu <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Quick Highlights */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              {
                icon: <Star className="w-8 h-8 text-accent" />,
                title: "Fresh Ingredients",
                desc: "We source our produce locally, ensuring every meal is as fresh as it is flavorful."
              },
              {
                icon: <Coffee className="w-8 h-8 text-accent" />,
                title: "Artisan Methods",
                desc: "From handmade pastas to slow-roasted meats, we never rush the cooking process."
              },
              {
                icon: <Wine className="w-8 h-8 text-accent" />,
                title: "Curated Pairings",
                desc: "Complement your meal with our hand-selected wines and traditional German beers."
              }
            ].map((feature, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.2, duration: 0.6 }}
                className="flex flex-col items-center text-center p-6 bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow duration-300"
              >
                <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-serif font-semibold mb-3 text-foreground">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Atmosphere / Quote Section */}
      <section className="py-24 bg-secondary">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Utensils className="w-12 h-12 text-primary/40 mx-auto mb-8" />
          <h2 className="text-3xl md:text-5xl font-serif italic text-foreground leading-relaxed mb-8">
            "Eating here feels like coming home. The aromas, the rustic charm, and the incredible food make every visit unforgettable."
          </h2>
          <div className="w-16 h-1 bg-primary mx-auto mb-6"></div>
          <p className="font-sans font-bold tracking-widest uppercase text-sm text-muted-foreground">
            A happy guest
          </p>
        </div>
      </section>
    </div>
  );
}
