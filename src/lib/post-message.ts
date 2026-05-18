import { Stage } from "@/lib/url-params";

export interface OutgoingStageMessage {
  type: "chrp-stage-complete";
  stage: Stage;
  nextStage: Stage;
}

export interface IncomingSetStageMessage {
  type: "chrp-set-stage";
  stage: Stage;
  track?: string;
}

export function postStageComplete(stage: Stage, nextStage: Stage) {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;
  const msg: OutgoingStageMessage = { type: "chrp-stage-complete", stage, nextStage };
  window.parent.postMessage(msg, "*");
}
