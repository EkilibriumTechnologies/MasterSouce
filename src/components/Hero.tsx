import { Button } from "@/components/ui/button";
import { Sparkles, Zap, Headphones } from "lucide-react";

export function Hero() {
  const scrollToMastering = () => {
    document.getElementById("mastering-interface")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative overflow-hidden pt-24 pb-32 px-4">
      {/* Background gradient glow */}
      <div className="absolute inset-0 bg-gradient-glow opacity-40 animate-glow-pulse" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet/20 blur-[120px] rounded-full" />
      
      <div className="relative max-w-6xl mx-auto text-center">
        {/* Brand */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-heading font-bold mb-4 gradient-text">
            MasterSauce
          </h1>
        </div>
        
        {/* Main headline */}
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold text-foreground mb-6 leading-tight animate-slide-up">
          Professional Mastering<br />
          <span className="text-muted-foreground">in Minutes, Not Hours</span>
        </h2>
        
        {/* Subheadline */}
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          Smart automatic mastering built for independent musicians, bedroom producers, and AI music creators. Upload your track, preview instantly, download the final master.
        </p>
        
        {/* CTA */}
        <div className="mb-16 animate-slide-up" style={{ animationDelay: "0.2s" }}>
          <Button 
            size="lg" 
            className="bg-gradient-accent hover:opacity-90 text-white font-semibold text-lg px-10 py-6 h-auto rounded-full glow-violet transition-all"
            onClick={scrollToMastering}
          >
            Start Mastering
            <Sparkles className="ml-2 h-5 w-5" />
          </Button>
        </div>
        
        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 animate-slide-up" style={{ animationDelay: "0.3s" }}>
          <div className="flex items-center gap-2 glass-card px-5 py-3 rounded-full">
            <Zap className="h-4 w-4 text-amber" />
            <span className="text-sm font-medium text-foreground">Fast Turnaround</span>
          </div>
          
          <div className="flex items-center gap-2 glass-card px-5 py-3 rounded-full">
            <Headphones className="h-4 w-4 text-violet" />
            <span className="text-sm font-medium text-foreground">Before/After Preview</span>
          </div>
          
          <div className="flex items-center gap-2 glass-card px-5 py-3 rounded-full">
            <Sparkles className="h-4 w-4 text-indigo" />
            <span className="text-sm font-medium text-foreground">Email Only for Download</span>
          </div>
        </div>
      </div>
    </section>
  );
}