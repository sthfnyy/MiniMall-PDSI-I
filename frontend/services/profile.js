import { apiRequest } from "./api.js";

export async function updateConsumerProfile(values, request = apiRequest) {
  return request("/consumidor/perfil", {
    method: "PATCH",
    body: JSON.stringify({
      nome_completo: values.nome_completo,
    }),
  });
}

export async function saveConsumerProfile({
  useRealApi,
  user,
  request = apiRequest,
}) {
  if (!useRealApi) {
    return { user, backendProfile: null };
  }

  const backendProfile = await updateConsumerProfile(
    { nome_completo: user.name },
    request,
  );
  return {
    user: { ...user, name: backendProfile.nome_completo },
    backendProfile,
  };
}
