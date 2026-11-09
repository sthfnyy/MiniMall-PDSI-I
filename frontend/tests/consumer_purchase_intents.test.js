import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  attachContestationToIntent,
  contestationStatusInfo,
  createConsumerContestation,
  fetchConsumerPurchaseIntents,
  validateContestation,
  validateContestationFiles,
} from "../services/consumerPurchaseIntents.js";


test("lista intenções autenticadas do consumidor", async () => {
  const calls = [];
  const response = [{ id: "intent-1" }];
  assert.deepEqual(await fetchConsumerPurchaseIntents(async (...args) => {
    calls.push(args);
    return response;
  }), response);
  assert.deepEqual(calls, [["/consumidor/intencoes-compra"]]);
});

test("resposta vazia ou inválida produz lista vazia", async () => {
  assert.deepEqual(await fetchConsumerPurchaseIntents(async () => []), []);
  assert.deepEqual(await fetchConsumerPurchaseIntents(async () => null), []);
});

test("contestação envia motivo e evidências por multipart", async () => {
  const calls = [];
  const file = new Blob(["imagem"], { type: "image/png" });
  Object.defineProperty(file, "name", { value: "prova.png" });
  Object.defineProperty(file, "size", { value: 6 });
  const result = await createConsumerContestation(
    "intent-1",
    "Realizei a compra e tenho comprovante.",
    [file],
    async (...args) => { calls.push(args); return { id: "contest-1" }; },
  );
  assert.equal(result.id, "contest-1");
  assert.equal(calls[0][0], "/consumidor/intencoes-compra/intent-1/contestacao");
  assert.equal(calls[0][1].method, "POST");
  assert.ok(calls[0][1].body instanceof FormData);
  assert.equal(calls[0][1].body.get("motivo"), "Realizei a compra e tenho comprovante.");
  assert.equal(calls[0][1].body.getAll("arquivos").length, 1);
});

test("validação rejeita motivo, MIME, tamanho e excesso de evidências", () => {
  assert.throws(() => validateContestation("curto", []), /entre 10 e 2000/);
  assert.throws(() => validateContestationFiles([
    { type: "text/plain", size: 1 },
  ]), /JPEG, PNG ou WebP/);
  assert.throws(() => validateContestationFiles([
    { type: "image/jpeg", size: 5 * 1024 * 1024 + 1 },
  ]), /5 MB/);
  assert.throws(() => validateContestationFiles(new Array(4).fill({
    type: "image/jpeg", size: 1,
  })), /no máximo 3/);
});

test("sucesso anexa contestação somente à intenção correspondente", () => {
  const intents = [{ id: "a", contestacao: null }, { id: "b", contestacao: null }];
  const updated = attachContestationToIntent(intents, "a", {
    id: "contest-1", status: "aguardando_analise",
  });
  assert.deepEqual(updated[0].contestacao, {
    id: "contest-1", status: "aguardando_analise",
  });
  assert.equal(updated[1].contestacao, null);
});

test("página cobre estados, retry, formulário, sucesso e bloqueio duplicado", () => {
  const source = readFileSync(new URL("../views/consumer/PurchaseIntents.jsx", import.meta.url), "utf8");
  assert.match(source, /Carregando compras e contatos/);
  assert.match(source, /Nenhum contato registrado/);
  assert.match(source, /Tentar novamente/);
  assert.match(source, /Contestar compra/);
  assert.match(source, /compra_nao_reconhecida/);
  assert.match(source, /!intent\.contestacao/);
  assert.match(source, /Aguardando análise administrativa/);
  assert.match(source, /if \(!selected \|\| submitting\) return/);
  assert.match(source, /Enviar contestação/);
});

test("rota protegida e acesso pelo perfil estão registrados", () => {
  const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../views/consumer/ConsumerProfile.jsx", import.meta.url), "utf8");
  assert.match(app, /route === "consumidor\/intencoes-compra"/);
  assert.match(app, /currentUser\?\.role === "consumidor"/);
  assert.match(profile, /Compras e contatos/);
});

test("status real da contestação é exibido ao consumidor", () => {
  assert.deepEqual(contestationStatusInfo("aguardando_analise"), {
    title: "Contestação enviada",
    text: "Aguardando análise administrativa.",
  });
  assert.equal(contestationStatusInfo("aprovada").title, "Contestação aprovada");
  assert.equal(contestationStatusInfo("reprovada").title, "Contestação reprovada");
  for (const status of ["aprovada", "reprovada"]) {
    assert.doesNotMatch(contestationStatusInfo(status).text, /Aguardando análise/);
  }
  const source = readFileSync(new URL("../views/consumer/PurchaseIntents.jsx", import.meta.url), "utf8");
  assert.match(source, /contestationStatusInfo\(intent\.contestacao\.status\)/);
  assert.doesNotMatch(source, /<p>Aguardando análise administrativa\.<\/p>/);
});
