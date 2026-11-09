import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  decideMerchantPurchaseIntent,
  fetchMerchantPurchaseIntents,
  updatePurchaseIntentInList,
} from "../services/merchantPurchaseIntents.js";

test("lista intenções pelo endpoint do lojista", async () => {
  const calls = [];
  const response = [{ id: "intent-1", status: "contato_realizado" }];
  assert.deepEqual(await fetchMerchantPurchaseIntents(async (...args) => {
    calls.push(args);
    return response;
  }), response);
  assert.deepEqual(calls, [["/lojista/intencoes-compra"]]);
});

test("lista vazia e resposta inválida resultam em lista vazia", async () => {
  assert.deepEqual(await fetchMerchantPurchaseIntents(async () => []), []);
  assert.deepEqual(await fetchMerchantPurchaseIntents(async () => null), []);
});

test("erro de carregamento é propagado para permitir tentar novamente", async () => {
  await assert.rejects(
    fetchMerchantPurchaseIntents(async () => { throw new Error("indisponível"); }),
    /indisponível/,
  );
});

test("decisão envia somente o novo status", async () => {
  const calls = [];
  await decideMerchantPurchaseIntent(
    "intent-1",
    "compra_confirmada",
    async (...args) => { calls.push(args); return { id: "intent-1" }; },
  );
  assert.equal(calls[0][0], "/lojista/intencoes-compra/intent-1");
  assert.equal(calls[0][1].method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0][1].body), { status: "compra_confirmada" });
  assert.ok(!calls[0][1].body.includes("loja_id"));
});

test("atualiza status decidido sem duplicar o item", () => {
  const current = [{ id: "intent-1", status: "contato_realizado" }];
  assert.deepEqual(
    updatePurchaseIntentInList(current, { id: "intent-1", status: "compra_nao_reconhecida" }),
    [{ id: "intent-1", status: "compra_nao_reconhecida" }],
  );
});

test("página contém estados, confirmação e bloqueio de nova decisão", () => {
  const source = readFileSync(new URL("../views/merchant/PurchaseIntents.jsx", import.meta.url), "utf8");
  assert.match(source, /Carregando intenções de contato/);
  assert.match(source, /Nenhuma intenção de contato/);
  assert.match(source, /Tentar novamente/);
  assert.match(source, /Confirmar que esta compra foi realizada/);
  assert.match(source, /Não reconheço esta compra/);
  assert.match(source, /intent\.status === "contato_realizado"/);
  assert.match(source, /disabled=\{Boolean\(decidingId\)\}/);
});

test("rota protegida e aba do lojista estão registradas", () => {
  const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../views/merchant/MerchantNav.jsx", import.meta.url), "utf8");
  assert.match(app, /route === "lojista\/intencoes-compra"/);
  assert.match(app, /currentUser\?\.role === "lojista"/);
  assert.match(nav, /Intenções de contato/);
});
