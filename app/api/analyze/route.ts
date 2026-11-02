import { handleAnalyze } from "@/lib/handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export function POST(req: Request) {
  return handleAnalyze(req);
}
