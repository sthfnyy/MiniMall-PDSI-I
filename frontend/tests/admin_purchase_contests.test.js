import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CONTEST_FILTERS,
  INITIAL_CONTEST_FILTER,
  canDecideContest,
  decideAdminPurchaseContest,
  evidenceViewKind,
  fetchAdminPurchaseContest,
  fetchAdminPurchaseContests,
  fetchContestEvidenceBlob,
  updateContestInList,
  validateContestDecision,
} from "../services/adminPurchaseContests.js";

const page = () =>
  readFileSync(new URL("../views/admin/PurchaseContests.jsx", import.meta.url), "utf8");

function recorder(response) {
  const calls = [];
  const request = async (...args) => {
    calls.push(args);
    return typeof response === "function" ? response(...args) : response;
  };
  return { calls, request };
}

test("listagem chama o endpoint administrativo sem filtro", async () => {
  const { calls, request } = recorder([{ id: "c1" }]);
  assert.deepEqual(await fetchAdminPurchaseContests("", request), [{ id: "c1" }]);
  assert.deepEqual(calls, [["/admin/contestacoes"]]);
});

test("listagem envia filtro de status", async () => {
  const { calls, request } = recorder([]);
  await fetchAdminPurchaseContests("aguardando_analise", request);
  assert.deepEqual(calls, [["/admin/contestacoes?status_filtro=aguardando_analise"]]);
});

test("listagem vazia ou inválida resulta em lista vazia", async () => {
  assert.deepEqual(await fetchAdminPurchaseContests("", async () => []), []);
  assert.deepEqual(await fetchAdminPurchaseContests("", async () => null), []);
});

test("erro da listagem é propagado para permitir tentar novamente", async () => {
  await assert.rejects(
    fetchAdminPurchaseContests("", async () => { throw new Error("indisponível"); }),
    /indisponível/,
  );
});

test("filtros disponíveis e filtro inicial priorizam a fila pendente", () => {
  assert.deepEqual(CONTEST_FILTERS.map(([, label]) => label), [
    "Todas", "Aguardando análise", "Aprovadas", "Reprovadas",
  ]);
  assert.equal(INITIAL_CONTEST_FILTER, "aguardando_analise");
});

test("detalhe chama o endpoint da contestação", async () => {
  const { calls, request } = recorder({ id: "c1" });
  assert.deepEqual(await fetchAdminPurchaseContest("c1", request), { id: "c1" });
  assert.deepEqual(calls, [["/admin/contestacoes/c1"]]);
});

test("aprovação envia somente status (observação opcional)", async () => {
  const { calls, request } = recorder({ id: "c1", status: "aprovada" });
  await decideAdminPurchaseContest("c1", "aprovada", "", request);
  assert.equal(calls[0][0], "/admin/contestacoes/c1");
  assert.equal(calls[0][1].method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0][1].body), { status: "aprovada" });

  await decideAdminPurchaseContest("c1", "aprovada", "  ok, válido ", request);
  assert.deepEqual(JSON.parse(calls[1][1].body), {
    status: "aprovada", observacao_admin: "ok, válido",
  });
});

test("reprovação envia observação e nunca campos de auditoria", async () => {
  const { calls, request } = recorder({ id: "c1", status: "reprovada" });
  await decideAdminPurchaseContest("c1", "reprovada", " Comprovante ilegível ", request);
  const body = JSON.parse(calls[0][1].body);
  assert.deepEqual(body, { status: "reprovada", observacao_admin: "Comprovante ilegível" });
  for (const field of ["decidido_por", "decidido_em", "consumidor_id", "intencao_id"]) {
    assert.ok(!(field in body));
  }
});

test("reprovação sem observação é bloqueada antes da requisição", async () => {
  const { calls, request } = recorder({});
  for (const note of ["", "   ", "ok"]) {
    await assert.rejects(decideAdminPurchaseContest("c1", "reprovada", note, request));
  }
  assert.equal(calls.length, 0);
  assert.throws(() => validateContestDecision("reprovada", ""), /observação para reprovar/);
  assert.throws(() => validateContestDecision("reprovada", "x".repeat(1001)), /entre 3 e 1000/);
  assert.throws(() => validateContestDecision("aguardando_analise", ""), /Decisão inválida/);
});

test("erro 409 da decisão é propagado com status", async () => {
  const conflict = Object.assign(new Error("Esta contestação já foi decidida"), { status: 409 });
  await assert.rejects(
    decideAdminPurchaseContest("c1", "aprovada", "", async () => { throw conflict; }),
    (error) => error.status === 409,
  );
});

test("atualiza item decidido na lista e respeita o filtro ativo", () => {
  const list = [
    { id: "c1", codigo: "MM-1", status: "aguardando_analise", decidido_em: null },
    { id: "c2", codigo: "MM-2", status: "aguardando_analise", decidido_em: null },
  ];
  const updated = { id: "c1", status: "aprovada", decidido_em: "2026-11-09T12:00:00Z", motivo: "x" };
  const all = updateContestInList(list, updated, "");
  assert.deepEqual(all[0], {
    id: "c1", codigo: "MM-1", status: "aprovada", decidido_em: "2026-11-09T12:00:00Z",
  });
  assert.equal(all.length, 2);
  const pending = updateContestInList(list, updated, "aguardando_analise");
  assert.deepEqual(pending.map((item) => item.id), ["c2"]);
});

test("evidência é baixada como blob pelo endpoint protegido", async () => {
  const blob = new Blob(["png"], { type: "image/png" });
  const { calls, request } = recorder(blob);
  const result = await fetchContestEvidenceBlob("c1", "e1", request);
  assert.equal(result, blob);
  assert.deepEqual(calls, [["/admin/contestacoes/c1/evidencias/e1"]]);
});

test("visualização da evidência depende do MIME", () => {
  assert.equal(evidenceViewKind("image/png"), "image");
  assert.equal(evidenceViewKind("image/jpeg"), "image");
  assert.equal(evidenceViewKind("image/webp"), "image");
  assert.equal(evidenceViewKind("application/pdf"), "pdf");
  assert.equal(evidenceViewKind("application/zip"), "download");
});

test("botões de decisão só aparecem para contestação pendente", () => {
  assert.equal(canDecideContest({ status: "aguardando_analise" }), true);
  assert.equal(canDecideContest({ status: "aprovada" }), false);
  assert.equal(canDecideContest({ status: "reprovada" }), false);
  const source = page();
  assert.match(source, /canDecideContest\(detail\) && !confirming/);
  assert.match(source, /Aprovar contestação/);
  assert.match(source, /Reprovar contestação/);
});

test("página cobre loading, vazio, erro e retry", () => {
  const source = page();
  assert.match(source, /Carregando contestações/);
  assert.match(source, /Nenhuma contestação encontrada/);
  assert.match(source, /Não foi possível carregar as contestações/);
  assert.match(source, /Tentar novamente/);
  assert.match(source, /onClick=\{loadContests\}/);
});

test("página pede confirmação e exige observação na reprovação", () => {
  const source = page();
  assert.match(source, /Confirmar a aprovação desta contestação/);
  assert.match(source, /Confirmar a reprovação desta contestação/);
  assert.match(source, /Observação \(obrigatória\)/);
  assert.match(source, /validateContestDecision\(confirming, note\)/);
  assert.match(source, /confirming === "reprovada" && note\.trim\(\)\.length < 3/);
});

test("botões ficam desabilitados durante o processamento", () => {
  const source = page();
  assert.match(source, /if \(!detail \|\| !confirming \|\| processing\) return/);
  assert.match(source, /disabled=\{processing\}/);
  assert.match(source, /Registrando\.\.\./);
});

test("página exibe quem decidiu, quando decidiu e trata 409", () => {
  const source = page();
  assert.match(source, /Decidido por/);
  assert.match(source, /detail\.decidido_por\?\.nome/);
  assert.match(source, /Decidido em/);
  assert.match(source, /formatDate\(detail\.decidido_em\)/);
  assert.match(source, /decisionFailure\.status === 409/);
  assert.match(source, /já foi decidida/);
  assert.match(source, /loadDetail\(detail\.id\)/);
});

test("evidência usa Object URL temporário e nunca storage_path", () => {
  const source = page();
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /URL\.revokeObjectURL/);
  assert.match(source, /fetchEvidenceFn\(selectedId, item\.id\)/);
  assert.doesNotMatch(source, /storage_path/);
  const service = readFileSync(new URL("../services/adminPurchaseContests.js", import.meta.url), "utf8");
  assert.doesNotMatch(service, /storage_path|supabase\.co\/storage/);
  assert.match(service, /Authorization: `Bearer \$\{token\}`/);
});

test("detalhe mostra os dados da contestação no Modal existente", () => {
  const source = page();
  assert.match(source, /import \{ Empty, Modal \} from "\.\.\/\.\.\/components\/ui"/);
  for (const label of [
    "Código", "Consumidor", "Produto", "Loja", "Data do contato",
    "Decisão do lojista", "Motivo da contestação", "Evidências",
  ]) {
    assert.ok(source.includes(label), label);
  }
});

test("nova aba está registrada no painel do administrador", () => {
  const admin = readFileSync(new URL("../views/admin/Admin.jsx", import.meta.url), "utf8");
  assert.match(admin, /Contestações de compras/);
  assert.match(admin, /<PurchaseContests notify=\{props\.notify\} \/>/);
  const app = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  assert.match(app, /currentUser\?\.role === "admin"/);
});
