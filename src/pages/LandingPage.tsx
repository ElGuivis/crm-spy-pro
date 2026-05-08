import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { CredibilityBar } from "@/components/landing/CredibilityBar";
import { ProblemSolution } from "@/components/landing/ProblemSolution";
import { LoyaltyEcosystem } from "@/components/landing/LoyaltyEcosystem";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ComparisonSection } from "@/components/landing/ComparisonSection";
import { VisualDemo } from "@/components/landing/VisualDemo";
import {
  Scenarios, MidCTA, ObjectionBreaker, FAQSection, FinalCTA, LandingFooter,
} from "@/components/landing/SectionsBottom";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground dark">
      <LandingNav />
      <main className="pt-16">
        <HeroSection />
        <CredibilityBar />
        <ProblemSolution />
        <LoyaltyEcosystem />
        <FeaturesSection />
        <HowItWorks />
        <ComparisonSection />
        <MidCTA />
        <VisualDemo />
        <Scenarios />
        <ObjectionBreaker />
        <FAQSection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
