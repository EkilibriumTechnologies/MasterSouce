import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Mail, Lock } from "lucide-react";

export function DownloadGate() {
  const [email, setEmail] = useState("");

  return (
    <section className="py-20 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="glass-card rounded-3xl p-8 md:p-12 border-2 border-violet/30 relative overflow-hidden">
          {/* Glow effect */}
          <div className="absolute inset-0 bg-gradient-glow opacity-30" />
          
          <div className="relative text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-accent flex items-center justify-center glow-violet">
              <Download className="h-10 w-10 text-white" />
            </div>
            
            <h3 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">
              Ready to Download?
            </h3>
            
            <p className="text-muted-foreground text-lg mb-8">
              Enter your email to unlock your mastered track. We'll send you the download link instantly — no account required.
            </p>
            
            <div className="max-w-md mx-auto space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-12 h-14 bg-secondary/50 border-border rounded-xl text-lg"
                />
              </div>
              
              <Button 
                size="lg" 
                className="w-full bg-gradient-accent hover:opacity-90 text-white font-bold text-lg py-6 h-auto rounded-xl glow-violet"
              >
                <Lock className="mr-2 h-5 w-5" />
                Unlock Download
              </Button>
            </div>
            
            <p className="text-sm text-muted-foreground mt-6">
              Your email is only used to send the download link. We respect your privacy.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}