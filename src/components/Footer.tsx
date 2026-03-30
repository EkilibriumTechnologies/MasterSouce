import Link from "next/link";
import { Music } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/50 py-12 px-4 bg-secondary/10">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-accent flex items-center justify-center">
              <Music className="h-6 w-6 text-white" />
            </div>
            <div>
              <h5 className="font-heading font-bold text-foreground text-lg">
                MasterSauce
              </h5>
              <p className="text-xs text-muted-foreground">
                Smart mastering for creators
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-8 text-sm text-muted-foreground">
            <Link href="/about" className="hover:text-foreground transition-colors">
              About
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <a href="#" className="hover:text-foreground transition-colors">
              Contact
            </a>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-border/30 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} MasterSauce. Built for independent creators.
        </div>
      </div>
    </footer>
  );
}