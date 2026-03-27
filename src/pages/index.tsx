import { SEO } from "@/components/SEO";
import { Hero } from "@/components/Hero";
import { MasteringInterface } from "@/components/MasteringInterface";
import { ComparisonSection } from "@/components/ComparisonSection";
import { DownloadGate } from "@/components/DownloadGate";
import { HowItWorks } from "@/components/HowItWorks";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <SEO
        title="MasterSouce - Smart Audio Mastering for Creators"
        description="Professional automatic mastering for independent musicians and AI music creators. Upload, preview, and download your mastered tracks in minutes."
        image="/og-image.png"
      />
      
      <div className="min-h-screen bg-background">
        <Hero />
        <MasteringInterface />
        <ComparisonSection />
        <DownloadGate />
        <HowItWorks />
        <Footer />
      </div>
    </>
  );
}