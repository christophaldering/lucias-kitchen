import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { CalendarDays, Clock, Users, User, Mail, Phone, MessageSquare, CheckCircle2 } from "lucide-react";
import { useCreateReservation } from "@workspace/api-client-react";

// Matches API CreateReservation schema
const reservationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(6, "Please enter a valid phone number"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format must be YYYY-MM-DD"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Format must be HH:MM"),
  guests: z.coerce.number().min(1, "At least 1 guest").max(20, "Maximum 20 guests"),
  notes: z.string().optional(),
});

type ReservationFormValues = z.infer<typeof reservationSchema>;

export default function Reservation() {
  const [isSuccess, setIsSuccess] = useState(false);
  
  const { mutate, isPending, error } = useCreateReservation();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<ReservationFormValues>({
    resolver: zodResolver(reservationSchema),
    defaultValues: {
      guests: 2,
    }
  });

  const onSubmit = (data: ReservationFormValues) => {
    // API hook expects { data: ... } 
    mutate({ data }, {
      onSuccess: () => {
        setIsSuccess(true);
        reset();
      }
    });
  };

  // Get today's date for min attribute
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="pt-24 pb-20 min-h-screen bg-background relative">
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 w-1/3 h-1/2 bg-secondary/30 rounded-bl-[200px] pointer-events-none"></div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 relative z-10 mt-8">
        <div className="text-center mb-12">
          <span className="text-primary font-bold tracking-widest text-xs uppercase mb-4 block">
            Join Us
          </span>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-4">
            Book a Table
          </h1>
          <p className="text-muted-foreground">
            Reserve your spot at Lucias Küche. For parties larger than 20, please contact us directly.
          </p>
        </div>

        {isSuccess ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border shadow-xl rounded-2xl p-10 text-center"
          >
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-3xl font-serif font-bold text-foreground mb-4">Reservation Confirmed!</h2>
            <p className="text-muted-foreground mb-8">
              Thank you for choosing Lucias Küche. We have received your reservation and will send a confirmation email shortly. We look forward to serving you!
            </p>
            <button 
              onClick={() => setIsSuccess(false)}
              className="text-primary font-semibold hover:underline"
            >
              Make another reservation
            </button>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border/50 shadow-xl rounded-2xl overflow-hidden"
          >
            <form onSubmit={handleSubmit(onSubmit)} className="p-8 md:p-10 space-y-8">
              
              {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm">
                  {error.message || "Something went wrong. Please try again."}
                </div>
              )}

              {/* Personal Details */}
              <div className="space-y-6">
                <h3 className="text-xl font-serif font-semibold border-b border-border pb-2">Your Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <User className="w-4 h-4 text-primary" /> Full Name
                    </label>
                    <input 
                      {...register("name")}
                      className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="Jane Doe"
                    />
                    {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Mail className="w-4 h-4 text-primary" /> Email Address
                    </label>
                    <input 
                      {...register("email")}
                      type="email"
                      className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="jane@example.com"
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Phone className="w-4 h-4 text-primary" /> Phone Number
                    </label>
                    <input 
                      {...register("phone")}
                      className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="+49 151 12345678"
                    />
                    {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                  </div>
                </div>
              </div>

              {/* Reservation Details */}
              <div className="space-y-6">
                <h3 className="text-xl font-serif font-semibold border-b border-border pb-2">Reservation Info</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-primary" /> Date
                    </label>
                    <input 
                      {...register("date")}
                      type="date"
                      min={today}
                      className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4 text-primary" /> Time
                    </label>
                    <input 
                      {...register("time")}
                      type="time"
                      className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    {errors.time && <p className="text-red-500 text-xs mt-1">{errors.time.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" /> Guests
                    </label>
                    <input 
                      {...register("guests")}
                      type="number"
                      min="1"
                      max="20"
                      className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    {errors.guests && <p className="text-red-500 text-xs mt-1">{errors.guests.message}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" /> Special Requests (Optional)
                  </label>
                  <textarea 
                    {...register("notes")}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                    placeholder="Allergies, special occasions, preferred seating..."
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={isPending}
                className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-bold tracking-widest uppercase shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isPending ? "Confirming..." : "Confirm Reservation"}
              </button>
            </form>
          </motion.div>
        )}
      </div>
    </div>
  );
}
