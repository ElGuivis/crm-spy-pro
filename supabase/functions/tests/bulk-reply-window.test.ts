import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isWithinSendingWindow, replyWindowOpen } from "../_shared/bulk-schedule.ts";

// 27/11/2026 é sexta (5). Horários em Brasília = UTC-3.
const brt = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 27, h + 3, m));
const camp = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, { start: "09:00", end: "20:00" }]));

Deno.test("resposta do disparo: horário da campanha em Brasília", () => {
  assertEquals(replyWindowOpen(camp, "America/Sao_Paulo", brt(4, 8)), false);  // 4h08: agenda
  assertEquals(replyWindowOpen(camp, "America/Sao_Paulo", brt(8, 59)), false);
  assertEquals(replyWindowOpen(camp, "America/Sao_Paulo", brt(9, 0)), true);
  assertEquals(replyWindowOpen(camp, "America/Sao_Paulo", brt(19, 59)), true);
  assertEquals(replyWindowOpen(camp, "America/Sao_Paulo", brt(20, 0)), false);
});

Deno.test("campanha sem horário: padrão 08:00–21:00 só para a resposta", () => {
  assertEquals(replyWindowOpen(null, null, brt(7, 59)), false);
  assertEquals(replyWindowOpen(null, null, brt(8, 0)), true);
  assertEquals(replyWindowOpen({}, null, brt(21, 0)), false);
  assertEquals(isWithinSendingWindow(null, null, brt(3)), true); // disparo sem horário segue sem restrição
});

Deno.test("meia-noite não vira 24:00", () => {
  const all = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, { start: "00:00", end: "01:00" }]));
  assertEquals(isWithinSendingWindow(all, "America/Sao_Paulo", brt(0, 30)), true);
});
