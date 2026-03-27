import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Music, Volume2, Play } from "lucide-react";

const GENRES = ["Pop", "Hip-Hop", "EDM", "Rock", "Reggaeton", "R&B", "Lo-Fi"];
const LOUDNESS_MODES = [
  { value: "clean", label: "Clean", description: "Natural dynamics" },
  { value: "balanced", label: "Balanced", description: "Industry standard" },
  { value: "loud", label: "Loud", description: "Maximum impact" },
];

export function MasteringInterface() {
  const [selectedGenre, setSelectedGenre] = useState<string>("Pop");
  const [selectedLoudness, setSelectedLoudness] = useState<string>("balanced");
  const [isDragging, setIsDragging] = useState(false);

  return (
    <section id="mastering-interface" className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h3 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">
            Upload & Master Your Track
          </h3>
          <p className="text-muted-foreground text-lg">
            Choose your settings and let our AI do the rest
          </p>
        </div>
        
        <div className="glass-card rounded-3xl p-8 md:p-12 border-2 border-border/50 relative overflow-hidden">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-card opacity-50 pointer-events-none" />
          
          <div className="relative space-y-8">
            {/* Upload Zone */}
            <div 
              className={`
                border-2 border-dashed rounded-2xl p-12 text-center transition-all
                ${isDragging 
                  ? "border-violet bg-violet/10 glow-violet" 
                  : "border-border hover:border-violet/50 bg-secondary/30"
                }
              `}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-gradient-accent flex items-center justify-center glow-violet">
                  <Upload className="h-10 w-10 text-white" />
                </div>
                
                <div>
                  <h4 className="text-xl font-heading font-semibold text-foreground mb-2">
                    Drop your track here
                  </h4>
                  <p className="text-muted-foreground mb-4">
                    or click to browse
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Supports WAV, MP3 (max 100MB)
                  </p>
                </div>
                
                <Button variant="outline" size="lg" className="mt-2">
                  <Music className="mr-2 h-5 w-5" />
                  Browse Files
                </Button>
              </div>
            </div>
            
            {/* Genre Selection */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-4">
                Genre Preset
              </label>
              <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
                {GENRES.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => setSelectedGenre(genre)}
                    className={`
                      px-4 py-3 rounded-xl font-medium transition-all text-sm
                      ${selectedGenre === genre
                        ? "bg-gradient-accent text-white glow-violet"
                        : "bg-secondary/50 text-foreground hover:bg-secondary border border-border"
                      }
                    `}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Loudness Mode */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-4">
                Loudness Mode
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {LOUDNESS_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setSelectedLoudness(mode.value)}
                    className={`
                      p-6 rounded-2xl text-left transition-all border-2
                      ${selectedLoudness === mode.value
                        ? "border-violet bg-violet/10 glow-violet"
                        : "border-border bg-secondary/30 hover:border-violet/30"
                      }
                    `}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Volume2 className={`h-5 w-5 ${selectedLoudness === mode.value ? "text-violet" : "text-muted-foreground"}`} />
                      <h5 className="font-heading font-semibold text-foreground">
                        {mode.label}
                      </h5>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {mode.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Master Button */}
            <div className="pt-4">
              <Button 
                size="lg" 
                className="w-full bg-gradient-accent hover:opacity-90 text-white font-bold text-lg py-6 h-auto rounded-xl glow-violet transition-all"
              >
                <Play className="mr-2 h-5 w-5" />
                Master My Track
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}