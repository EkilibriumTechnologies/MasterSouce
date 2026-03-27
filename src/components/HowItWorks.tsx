import { Upload, Settings, Headphones, Download } from "lucide-react";

const STEPS = [
  {
    icon: Upload,
    title: "Upload Your Track",
    description: "Drag and drop your WAV or MP3 file. Simple and fast.",
  },
  {
    icon: Settings,
    title: "Choose Your Settings",
    description: "Pick your genre and desired loudness. Our AI handles the rest.",
  },
  {
    icon: Headphones,
    title: "Preview Instantly",
    description: "Compare original vs mastered before downloading. No surprises.",
  },
  {
    icon: Download,
    title: "Download & Go",
    description: "Enter your email once and get your mastered track immediately.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h3 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">
            How It Works
          </h3>
          <p className="text-muted-foreground text-lg">
            Professional mastering in four simple steps
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {STEPS.map((step, index) => (
            <div key={index} className="text-center">
              <div className="relative inline-block mb-6">
                <div className="absolute inset-0 bg-violet/20 blur-xl rounded-full" />
                <div className="relative w-20 h-20 mx-auto rounded-2xl bg-gradient-accent flex items-center justify-center glow-violet">
                  <step.icon className="h-10 w-10 text-white" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-amber text-background font-bold text-sm flex items-center justify-center glow-amber">
                  {index + 1}
                </div>
              </div>
              
              <h4 className="text-xl font-heading font-semibold text-foreground mb-3">
                {step.title}
              </h4>
              <p className="text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
        
        {/* Rights & Pricing Section */}
        <div className="grid md:grid-cols-2 gap-8 mt-20">
          <div className="glass-card rounded-2xl p-8 border border-border/50">
            <h4 className="text-2xl font-heading font-semibold text-foreground mb-4">
              Your Rights, Always
            </h4>
            <p className="text-muted-foreground mb-4">
              You retain 100% ownership of your music. We process your tracks securely and never store or distribute your files without permission.
            </p>
            <p className="text-muted-foreground">
              MasterSouce is a tool, not a rights holder. Your creative work stays yours.
            </p>
          </div>
          
          <div className="glass-card rounded-2xl p-8 border border-border/50 bg-violet/5">
            <h4 className="text-2xl font-heading font-semibold text-foreground mb-4">
              Free for Now
            </h4>
            <p className="text-muted-foreground mb-4">
              MasterSouce is currently free while in beta. We're building the best mastering experience for creators like you.
            </p>
            <p className="text-muted-foreground">
              Paid plans with advanced features coming soon. Early users get priority access.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}