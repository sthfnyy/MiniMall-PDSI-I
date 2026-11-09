import { apiRequest } from "./api.js";
import { getAccessToken } from "./auth.js";

const API_URL = import.meta.env?.VITE_API_URL || "";
const BASE = "/admin/contestacoes";

export const CONTEST_STATUS_LABELS = {
  aguardando_analise: "Aguardando análise",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
};

export const CONTEST_STATUS_BADGES = {
  aguardando_analise: "pending",
  aprovada: "approved",
  reprovada: "rejected",
};

export const CONTEST_FILTERS = [
  ["", "Todas"],
  ["aguardando_analise", "Aguardando análise"],
  ["aprovada", "Aprovadas"],
  ["reprovada", "Reprovadas"],
];

export const INITIAL_CONTEST_FILTER = "aguardando_analise";

export const MERCHANT_DECISION_LABELS = {
  contato_realizado: "Aguardando confirmação do lojista",
  compra_confirmada: "Compra confirmada",
  compra_nao_reconhecida: "Compra não reconhecida",
};

export async function fetchAdminPurchaseContests(statusFilter = "", request = apiRequest) {
  const query = statusFilter
    ? `?status_filtro=${encodeURIComponent(statusFilter)}`
    : "";
  const response = await request(`${BASE}${query}`);
  return Array.isArray(response) ? response : [];
}

export async function fetchAdminPurchaseContest(contestId, request = apiRequest) {
  return request(`${BASE}/${encodeURIComponent(contestId)}`);
}

export function validateContestDecision(status, note = "") {
  if (status !== "aprovada" && status !== "reprovada") {
    throw new Error("Decisão inválida.");
  }
  const normalized = String(note || "").trim();
  if (status === "reprovada" && !normalized) {
    throw new Error("Informe a observação para reprovar a contestação.");
  }
  if (normalized && (normalized.length < 3 || normalized.length > 1000)) {
    throw new Error("A observação deve ter entre 3 e 1000 caracteres.");
  }
  return normalized ? { status, observacao_admin: normalized } : { status };
}

export async function decideAdminPurchaseContest(
  contestId,
  status,
  note = "",
  request = apiRequest,
) {
  const payload = validateContestDecision(status, note);
  return request(`${BASE}/${encodeURIComponent(contestId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function blobRequest(endpoint) {
  const token = await getAccessToken();
  if (!token) throw new Error("Sessão expirada ou usuário não autenticado.");
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = null;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      // corpo não é JSON
    }
    const error = new Error(
      detail || `Não foi possível carregar a evidência (HTTP ${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return response.blob();
}

export async function fetchContestEvidenceBlob(
  contestId,
  evidenceId,
  request = blobRequest,
) {
  return request(
    `${BASE}/${encodeURIComponent(contestId)}/evidencias/${encodeURIComponent(evidenceId)}`,
  );
}

export function evidenceViewKind(mime = "") {
  if (/^image\/(jpeg|png|webp|gif)$/.test(mime)) return "image";
  if (mime === "application/pdf") return "pdf";
  return "download";
}

export function canDecideContest(contest) {
  return contest?.status === "aguardando_analise";
}

export function updateContestInList(contests, updated, statusFilter = "") {
  const summary = {
    id: updated.id,
    status: updated.status,
    decidido_em: updated.decidido_em ?? null,
  };
  return contests
    .map((contest) => (contest.id === updated.id ? { ...contest, ...summary } : contest))
    .filter((contest) => !statusFilter || contest.status === statusFilter);
}
