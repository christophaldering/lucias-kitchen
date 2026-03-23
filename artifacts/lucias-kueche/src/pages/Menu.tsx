import { useGetMenuItems } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Leaf, WheatOff, Info } from "lucide-react";
import type { MenuItem } from "@workspace/api-client-react";

const CATEGORY_LABELS: Record<string, string> = {
  vorspeisen: "Vorspeisen / Starters",
  hauptgerichte: "Hauptgerichte / Main Courses",
  desserts: "Desserts",
  getraenke: "Getränke / Drinks",
};

const CATEGORY_ORDER = ['vorspeisen', 'hauptgerichte', 'desserts', 'getraenke'];

export default function Menu() {
  const { data: menuItems, isLoading, error } = useGetMenuItems();

  const groupedMenu = menuItems?.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>) || {};

  return (
    <div className="pt-24 pb-20 min-h-screen bg-background">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto px-4 mb-16 mt-8">
        <span className="text-primary font-bold tracking-widest text-xs uppercase mb-4 block">
          Taste the Tradition
        </span>
        <h1 className="text-5xl md:text-6xl font-serif font-bold text-foreground mb-6">
          Our Menu
        </h1>
        <p className="text-muted-foreground text-lg">
          Crafted with seasonal ingredients and traditional recipes handed down through generations.
        </p>
        
        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-6 mt-8 p-4 bg-card inline-flex rounded-lg border border-border shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Leaf className="w-4 h-4 text-green-600" /> Vegetarian
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Leaf className="w-4 h-4 fill-green-600 text-green-600" /> Vegan
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <WheatOff className="w-4 h-4 text-amber-600" /> Gluten-Free
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      )}

      {error && (
        <div className="max-w-2xl mx-auto p-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-center flex items-center justify-center gap-3">
          <Info className="w-6 h-6" />
          <p>We're having trouble loading the menu right now. Please try again later.</p>
        </div>
      )}

      {/* Menu Categories */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
        {CATEGORY_ORDER.map((categoryKey) => {
          const items = groupedMenu[categoryKey];
          if (!items || items.length === 0) return null;

          return (
            <motion.section 
              key={categoryKey}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-4 mb-10">
                <h2 className="text-3xl font-serif font-bold text-foreground">
                  {CATEGORY_LABELS[categoryKey]}
                </h2>
                <div className="h-px bg-border flex-grow mt-2"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                {items.map((item) => (
                  <div key={item.id} className="group relative">
                    <div className="flex justify-between items-baseline border-b border-border/60 border-dashed pb-2 mb-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl font-serif font-semibold text-foreground group-hover:text-primary transition-colors">
                          {item.name}
                        </h3>
                        {/* Dietary Badges */}
                        <div className="flex gap-1">
                          {item.isVegan && (
                            <span title="Vegan" className="bg-green-100 dark:bg-green-900/30 p-1 rounded-full text-green-700 dark:text-green-400">
                              <Leaf className="w-3 h-3 fill-current" />
                            </span>
                          )}
                          {!item.isVegan && item.isVegetarian && (
                            <span title="Vegetarian" className="bg-green-50 dark:bg-green-900/20 p-1 rounded-full text-green-600 dark:text-green-500">
                              <Leaf className="w-3 h-3" />
                            </span>
                          )}
                          {item.isGlutenFree && (
                            <span title="Gluten-Free" className="bg-amber-100 dark:bg-amber-900/30 p-1 rounded-full text-amber-700 dark:text-amber-400">
                              <WheatOff className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-lg font-semibold text-accent ml-4 whitespace-nowrap">
                        €{item.price.toFixed(2)}
                      </span>
                    </div>
                    
                    <div className="flex gap-4">
                      <p className="text-muted-foreground text-sm leading-relaxed flex-grow">
                        {item.description}
                      </p>
                      {item.imageUrl && (
                        <div className="w-20 h-20 shrink-0 rounded-md overflow-hidden bg-muted">
                          <img 
                            src={item.imageUrl} 
                            alt={item.name} 
                            className="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
