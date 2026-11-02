import dynamic from "next/dynamic";
import { Analyzer } from "@/components/Analyzer";
import { Navigation } from "@/components/Navigation";
import { CtaFooter } from "@/components/site/CtaFooter";
import { DocumentTypes } from "@/components/site/DocumentTypes";
import { Hero } from "@/components/site/Hero";
import { HowItWorks, Privacy } from "@/components/site/InfoSections";
import { Problem } from "@/components/site/Problem";
import { DecodeHeading } from "@/components/site/DecodeHeading";

// Browser-only WebGL world behind every section; the page works without it.
const SceneCanvas = dynamic(() => import("@/components/scene/SceneCanvas"));

export default function Home() {
  return (
    <>
      <SceneCanvas />
      <Navigation />
      <main id="main">
        <Hero />
        <Problem />
        <DocumentTypes />
        <HowItWorks />
        <Privacy />
        <section id="decode" className="scroll-mt-4 py-32" aria-labelledby="upload-title">
          <DecodeHeading />
          <Analyzer />
        </section>
      </main>
      <CtaFooter />
    </>
  );
}
