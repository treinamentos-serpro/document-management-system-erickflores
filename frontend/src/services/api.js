async function request(path, owner, { body, signal, binary = false } = {}) {
  if (!owner?.trim()) throw new Error('Informe um usuario.');

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'X-User-Id': owner.trim() },
      body,
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Nao foi possivel conectar ao servidor. Tente novamente.');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || `Nao foi possivel concluir a operacao (${response.status}).`);
  }

  try {
    return binary ? await response.blob() : await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('A resposta do servidor e invalida.');
  }
}

export async function listDocuments(owner, { signal } = {}) {
  const payload = await request('/documents', owner, { signal });
  if (!Array.isArray(payload?.documents)) throw new Error('A lista recebida do servidor e invalida.');
  return payload.documents;
}

export function uploadDocument(file, owner, { signal } = {}) {
  const body = new FormData();
  body.append('file', file);
  return request('/upload', owner, { body, signal });
}

export function downloadDocument(id, owner, { signal } = {}) {
  return request(`/documents/${encodeURIComponent(id)}/download`, owner, { signal, binary: true });
}