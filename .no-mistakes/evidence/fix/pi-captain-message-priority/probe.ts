import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const log = process.env.PROBE_LOG as string;
const trigger = process.env.FM_TRIGGER as string;
const rec = (o: unknown) => appendFileSync(log, JSON.stringify(o) + "\n");
const text = (c: unknown): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((b: any) => b.text ?? (b.type === "toolCall" ? `[toolCall ${b.name}]` : "")).join("") : "";

export default function (pi: ExtensionAPI): void {
  const faux = createFauxCore({
    api: "prio-probe-api", provider: "prio-probe",
    models: [{ id: "scripted", name: "scripted", reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 65536, maxTokens: 128 }],
    tokenSize: { min: 1, max: 1 },
  });
  pi.registerProvider("prio-probe", { baseUrl: "http://127.0.0.1/unused", apiKey: "test-only",
    api: faux.api, models: faux.models, streamSimple: faux.streamSimple });
  let step = 0;
  const respond = (ctx: any) => {
    step += 1;
    // Record only messages since the last assistant message: what this model step newly sees.
    const msgs = ctx.messages as any[];
    let i = msgs.length - 1;
    while (i >= 0 && msgs[i].role !== "assistant") i -= 1;
    const fresh = msgs.slice(i + 1).map((m) => ({ role: m.role, text: text(m.content).slice(0, 900) }));
    rec({ event: "model_step", step, fresh });
    return fauxAssistantMessage([fauxText(`MODEL_STEP_${step}_DONE`)]);
  };
  faux.setResponses([respond, respond, respond, respond]);
  rec({ event: "probe_loaded" });
  pi.registerTool({
    name: "work_tool", label: "work_tool",
    description: "Simulated long background supervision tool.",
    parameters: Type.Object({}),
    async execute(_id, _params, signal) {
      rec({ event: "tool_start" });
      await pi.sendUserMessage("ROUTINE_BACKGROUND_FOLLOWUP", { deliverAs: "followUp" });
      rec({ event: "routine_followup_queued" });
      writeFileSync(trigger, "go\n");
      rec({ event: "watcher_trigger_written" });
      if (process.env.PROBE_HOLD === "abort") {
        await new Promise<void>((r) => signal?.addEventListener("abort", () => r(), { once: true }));
        rec({ event: "tool_aborted_by_operator" });
        return { content: [{ type: "text", text: "aborted" }], details: {} };
      }
      await new Promise((r) => setTimeout(r, 3000));
      rec({ event: "tool_completed", aborted: !!signal?.aborted });
      return { content: [{ type: "text", text: "WORK_TOOL_COMPLETED" }], details: {} };
    },
  });
  pi.on("message_start", (e: any) => { if (e.message.role === "user") rec({ event: "user_message_start", text: text(e.message.content).slice(0, 120) }); });
  pi.registerCommand("probe", {
    description: "start scripted run",
    handler: async (_args, ctx) => {
      const model = ctx.modelRegistry.find("prio-probe", "scripted");
      if (!model || !(await pi.setModel(model))) throw new Error("probe model unavailable");
      faux.setResponses([
        (c: any) => { respond(c); return fauxAssistantMessage([fauxToolCall("work_tool", {}, { id: "work1" })], { stopReason: "toolUse" }); },
        respond, respond, respond, respond, respond,
      ]);
      pi.sendUserMessage("PROBE_START_SUPERVISION");
    },
  });
  pi.registerCommand("probe-arm", {
    description: "arm faux responses only (replacement session)",
    handler: async (_args, ctx) => {
      const model = ctx.modelRegistry.find("prio-probe", "scripted");
      if (!model || !(await pi.setModel(model))) throw new Error("probe model unavailable");
      faux.setResponses([respond, respond, respond, respond]);
      rec({ event: "replacement_model_armed" });
    },
  });
}
