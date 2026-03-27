import { Button } from "@/components/ui/button";
import { Play, Pause, Volume2 } from "lucide-react";
import { useState } from "react";

export function ComparisonSection() {
  const [playingOriginal, setPlayingOriginal] = useState(false);
  const [playingMastered, setPlayingMastered] = useState(false);

  return (
    <section className="py-20 px-4 bg-secondary/20">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h3 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">
            Compare Before & After
          </h3>
          <p className="text-muted-foreground text-lg">
            Preview your mastered track instantly — no download required
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Original Preview */}
          <div className="glass-card rounded-2xl p-8 border border-border/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="text-xl font-heading font-semibold text-foreground mb-1">
                  Original
                </h4>
                <p className="text-sm text-muted-foreground">
                  Your uploaded track
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                <Volume2 className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            
            {/* Waveform Visualization */}
            <div className="h-24 bg-secondary/50 rounded-xl mb-6 flex items-center justify-center">
              <div className="flex items-end gap-1 h-16">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div 
                    key={i}
                    className="w-1 bg-muted-foreground/30 rounded-full"
                    style={{ 
                      height: `${Math.random() * 100}%`,
                      minHeight: "8px"
                    }}
                  />
                ))}
              </div>
            </div>
            
            {/* Controls */}
            <div className="flex items-center gap-4">
              <Button
                size="lg"
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setPlayingOriginal(!playingOriginal)}
              >
                {playingOriginal ? (
                  <Pause className="mr-2 h-5 w-5" />
                ) : (
                  <Play className="mr-2 h-5 w-5" />
                )}
                {playingOriginal ? "Pause" : "Play Original"}
              </Button>
            </div>
          </div>
          
          {/* Mastered Preview */}
          <div className="glass-card rounded-2xl p-8 border-2 border-violet/50 bg-violet/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet/20 blur-[60px] rounded-full" />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h4 className="text-xl font-heading font-semibold text-foreground mb-1">
                    Mastered
                  </h4>
                  <p className="text-sm text-violet">
                    Enhanced by MasterSouce
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-gradient-accent flex items-center justify-center glow-violet">
                  <Volume2 className="h-5 w-5 text-white" />
                </div>
              </div>
              
              {/* Waveform Visualization */}
              <div className="h-24 bg-secondary/50 rounded-xl mb-6 flex items-center justify-center">
                <div className="flex items-end gap-1 h-16">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div 
                      key={i}
                      className="w-1 bg-gradient-to-t from-violet to-indigo rounded-full"
                      style={{ 
                        height: `${Math.random() * 100}%`,
                        minHeight: "12px"
                      }}
                    />
                  ))}
                </div>
              </div>
              
              {/* Controls */}
              <div className="flex items-center gap-4">
                <Button
                  size="lg"
                  className="flex-1 bg-gradient-accent hover:opacity-90 text-white rounded-xl glow-violet"
                  onClick={() => setPlayingMastered(!playingMastered)}
                >
                  {playingMastered ? (
                    <Pause className="mr-2 h-5 w-5" />
                  ) : (
                    <Play className="mr-2 h-5 w-5" />
                  )}
                  {playingMastered ? "Pause" : "Play Mastered"}
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            Preview is completely free • Enter email only to download the final file
          </p>
        </div>
      </div>
    </section>
  );
}