"use client";

import { MaskWords } from "./motion";

export function DecodeHeading() {
  return (
    <div className="mx-auto mb-14 max-w-3xl px-5 text-center">
      <p className="eyebrow mb-5">Decode yours</p>
      <h2 id="upload-title" className="title">
        <MaskWords text="Make sense of" onView /> <MaskWords text="any document." wordClassName="text-blend" delay={0.15} onView />
      </h2>
      <p className="mx-auto mt-5 max-w-lg text-lg text-white/60">
        Upload a PDF. We&apos;ll extract the important information and explain it in plain language.
      </p>
    </div>
  );
}
