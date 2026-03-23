import { motion } from "framer-motion";
import { Link } from "wouter";

export default function About() {
  return (
    <div className="pt-24 pb-20 min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          
          {/* Image Side */}
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl">
              <img 
                src={`${import.meta.env.BASE_URL}images/about-kitchen.png`} 
                alt="Our rustic kitchen" 
                className="w-full h-full object-cover"
              />
            </div>
            {/* Decorative frame */}
            <div className="absolute -inset-4 border-2 border-primary/20 rounded-2xl -z-10 hidden md:block"></div>
          </motion.div>

          {/* Text Side */}
          <motion.div 
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-6"
          >
            <span className="text-primary font-bold tracking-widest text-xs uppercase block">
              Our Heritage
            </span>
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground leading-tight">
              A legacy of flavor, <br/> built over generations.
            </h1>
            
            <div className="space-y-4 text-muted-foreground text-lg leading-relaxed">
              <p>
                Lucias Küche began as a humble dream to bring the comforting, rich aromas of our grandmother's kitchen to the heart of the city. We believe that food is more than sustenance—it is connection, memory, and love.
              </p>
              <p>
                Every morning, our chefs arrive early to knead fresh dough, slow-roast meats, and select the finest vegetables from local markets. We don't believe in shortcuts. A great demi-glace takes hours, and a perfect pastry needs patience.
              </p>
              <p>
                When you sit at our table, you aren't just a customer. You are a guest in our home. We invite you to slow down, pour a glass of wine, and savor every bite.
              </p>
            </div>

            <div className="pt-6">
              <p className="font-serif text-2xl italic text-foreground mb-4">"Gutes Essen hält Leib und Seele zusammen."</p>
              <p className="text-sm uppercase tracking-widest text-muted-foreground mb-8">
                (Good food holds body and soul together)
              </p>
              
              <Link 
                href="/menu"
                className="inline-block px-8 py-3 bg-card border-2 border-primary text-primary font-bold tracking-widest uppercase rounded-sm hover:bg-primary hover:text-white transition-colors duration-300"
              >
                Discover Our Menu
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
