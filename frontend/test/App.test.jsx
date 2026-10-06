import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App.jsx';

const firstDocument = {
  id: '12345678-1234-4123-8123-123456789012',
  originalName: 'relatorio.pdf',
  size: 2048,
  uploadedAt: '2026-10-06T12:00:00.000Z',
  owner: 'alice',
  mimeType: 'application/pdf',
};
const secondDocument = {
  ...firstDocument,
  id: '87654321-4321-4321-8321-210987654321',
  originalName: 'contrato.txt',
  owner: 'bob',
  mimeType: 'text/plain',
};
const binaryContent = new Uint8Array([0, 255, 1, 128, 13, 10]);

let requests;
let documentsByOwner;
let listOverride;
let uploadOverride;
let downloadOverride;
let downloadedLinks;

function deferredResponse() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function apiError(message, status) {
  return Response.json({ error: { code: 'TEST_ERROR', message } }, { status });
}

beforeEach(() => {
  requests = [];
  documentsByOwner = new Map();
  listOverride = null;
  uploadOverride = null;
  downloadOverride = null;
  downloadedLinks = [];

  class TestURL extends URL {}
  TestURL.createObjectURL = vi.fn(() => 'blob:http://localhost/document-download');
  TestURL.revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', TestURL);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    downloadedLinks.push({ href: this.href, filename: this.download });
  });

  vi.stubGlobal('fetch', vi.fn(async (input, options = {}) => {
    const pathname = new URL(typeof input === 'string' ? input : input.url, 'http://localhost').pathname;
    const method = options.method || 'GET';
    const owner = new Headers(options.headers).get('X-User-Id');
    requests.push({ pathname, method, owner, options });

    if (!owner?.trim()) return apiError('Informe o usuario.', 400);

    if (method === 'GET' && pathname === '/api/documents') {
      if (listOverride) return listOverride(owner, options);
      return Response.json({ documents: documentsByOwner.get(owner) || [] });
    }

    if (method === 'POST' && pathname === '/api/upload') {
      if (uploadOverride) return uploadOverride(owner, options);
      const file = options.body?.get?.('file');
      if (!file) return apiError('Envie um arquivo no campo file.', 400);
      const document = {
        id: crypto.randomUUID(),
        originalName: file.name,
        size: file.size,
        uploadedAt: '2026-10-06T13:00:00.000Z',
        owner,
        mimeType: file.type || 'application/octet-stream',
      };
      documentsByOwner.set(owner, [...(documentsByOwner.get(owner) || []), document]);
      return Response.json(document, { status: 201 });
    }

    if (method === 'GET' && /^\/api\/documents\/[^/]+\/download$/.test(pathname)) {
      if (downloadOverride) return downloadOverride(owner, options);
      return new Response(binaryContent, {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="relatorio.pdf"' },
      });
    }

    throw new Error(`Rota inesperada no teste: ${method} ${pathname}`);
  }));
});

async function selectOwner(user, owner) {
  const input = await screen.findByRole('textbox', { name: /usu[aá]rio/i });
  await user.clear(input);
  await user.type(input, owner);
  await user.keyboard('{Enter}');
  await waitFor(() => {
    expect(requests.some((request) => request.pathname === '/api/documents' && request.owner === owner)).toBe(true);
  });
}

async function openWorkspace(owner = 'alice') {
  const user = userEvent.setup();
  render(<App />);
  await selectOwner(user, owner);
  return user;
}

function fileInput() {
  return screen.getByLabelText(/selecionar (documento|arquivo)/i);
}

function uploadButton() {
  return screen.getByRole('button', { name: /^(enviar|enviando)/i });
}

function downloadButton(document = firstDocument) {
  return screen.getByRole('button', { name: `Baixar ${document.originalName}` });
}

describe('listagem e identificacao do usuario (RF-05, RF-08, RF-09)', () => {
  it('consulta /api/documents com o identificador do usuario', async () => {
    await openWorkspace();
    const request = requests.find((entry) => entry.pathname === '/api/documents' && entry.owner === 'alice');
    expect(request.method).toBe('GET');
    expect(new Headers(request.options.headers).get('X-User-Id')).toBe('alice');
  });

  it('exibe estado vazio quando o usuario nao possui documentos', async () => {
    await openWorkspace();
    expect(await screen.findByText(/nenhum documento/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /^baixar/i })).not.toBeInTheDocument();
  });

  it('exibe os documentos retornados e uma acao de download por item', async () => {
    documentsByOwner.set('alice', [firstDocument, { ...secondDocument, owner: 'alice' }]);
    await openWorkspace();
    expect(await screen.findByText(firstDocument.originalName)).toBeVisible();
    expect(screen.getByText(secondDocument.originalName)).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^baixar/i })).toHaveLength(2);
  });

  it('exibe carregamento enquanto aguarda a listagem', async () => {
    const pending = deferredResponse();
    listOverride = (owner) => owner === 'alice' ? pending.promise : Response.json({ documents: [] });
    await openWorkspace();
    expect(screen.getByText(/carregando/i)).toBeVisible();
    pending.resolve(Response.json({ documents: [firstDocument] }));
    expect(await screen.findByText(firstDocument.originalName)).toBeVisible();
    expect(screen.queryByText(/carregando/i)).not.toBeInTheDocument();
  });

  it('troca o usuario e nao mantem documentos do proprietario anterior', async () => {
    documentsByOwner.set('alice', [firstDocument]);
    documentsByOwner.set('bob', [secondDocument]);
    const user = await openWorkspace();
    await screen.findByText(firstDocument.originalName);
    await selectOwner(user, 'bob');
    expect(await screen.findByText(secondDocument.originalName)).toBeVisible();
    expect(screen.queryByText(firstDocument.originalName)).not.toBeInTheDocument();
  });

  it('ignora resposta atrasada depois de trocar de usuario', async () => {
    const pending = deferredResponse();
    listOverride = (owner) => owner === 'alice' ? pending.promise : Response.json({ documents: owner === 'bob' ? [secondDocument] : [] });
    const user = await openWorkspace();
    await selectOwner(user, 'bob');
    await screen.findByText(secondDocument.originalName);
    await act(async () => {
      pending.resolve(Response.json({ documents: [firstDocument] }));
      await pending.promise;
    });
    await waitFor(() => expect(screen.queryByText(/carregando/i)).not.toBeInTheDocument());
    expect(screen.getByText(secondDocument.originalName)).toBeVisible();
    expect(screen.queryByText(firstDocument.originalName)).not.toBeInTheDocument();
  });

  it('nao consulta a API com usuario vazio', async () => {
    const user = await openWorkspace();
    const countBefore = requests.length;
    await user.clear(screen.getByRole('textbox', { name: /usu[aá]rio/i }));
    await user.keyboard('{Enter}');
    expect(requests).toHaveLength(countBefore);
  });

  it('permite atualizar a listagem', async () => {
    const user = await openWorkspace();
    await screen.findByText(/nenhum documento/i);
    documentsByOwner.set('alice', [firstDocument]);
    await user.click(screen.getByRole('button', { name: /atualizar lista/i }));
    expect(await screen.findByText(firstDocument.originalName)).toBeVisible();
  });
});

describe('upload de documento (RF-01, RF-02, RF-08)', () => {
  it('impede envio quando nenhum arquivo foi selecionado', async () => {
    await openWorkspace();
    await screen.findByText(/nenhum documento/i);
    expect(uploadButton()).toBeDisabled();
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0);
  });

  it('permite selecionar somente um arquivo por vez', async () => {
    await openWorkspace();
    expect(fileInput()).toHaveAttribute('type', 'file');
    expect(fileInput()).not.toHaveAttribute('multiple');
  });

  it('envia multipart no campo file com usuario e sem forcar Content-Type', async () => {
    const user = await openWorkspace();
    await screen.findByText(/nenhum documento/i);
    const file = new File(['conteudo'], 'novo.txt', { type: 'text/plain' });
    await user.upload(fileInput(), file);
    await user.click(uploadButton());
    await waitFor(() => expect(requests.some((request) => request.pathname === '/api/upload')).toBe(true));
    const request = requests.find((entry) => entry.pathname === '/api/upload');
    expect(request.method).toBe('POST');
    expect(request.owner).toBe('alice');
    expect(request.options.body).toBeInstanceOf(FormData);
    expect([...request.options.body.keys()]).toEqual(['file']);
    expect(request.options.body.get('file')).toMatchObject({ name: 'novo.txt', size: 8, type: 'text/plain' });
    expect(new Headers(request.options.headers).has('Content-Type')).toBe(false);
  });

  it('mostra sucesso, atualiza a lista e limpa a selecao depois do upload', async () => {
    const user = await openWorkspace();
    await screen.findByText(/nenhum documento/i);
    await user.upload(fileInput(), new File(['conteudo'], 'novo.txt', { type: 'text/plain' }));
    await user.click(uploadButton());
    expect(await screen.findByText(/enviado com sucesso/i)).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Baixar novo.txt' })).toBeEnabled();
    expect(fileInput().files).toHaveLength(0);
    expect(uploadButton()).toBeDisabled();
  });

  it('bloqueia novos envios enquanto o upload esta em andamento', async () => {
    const pending = deferredResponse();
    uploadOverride = () => pending.promise;
    const user = await openWorkspace();
    await screen.findByText(/nenhum documento/i);
    await user.upload(fileInput(), new File(['conteudo'], 'novo.txt'));
    await user.click(uploadButton());
    expect(uploadButton()).toBeDisabled();
    expect(fileInput()).toBeDisabled();
    expect(screen.getByText(/enviando/i)).toBeVisible();
    await user.click(uploadButton());
    expect(requests.filter((request) => request.pathname === '/api/upload')).toHaveLength(1);
    pending.resolve(apiError('Falha no envio.', 500));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha no envio.');
  });

  it('mostra erro 413 sem sucesso e preserva o arquivo para nova tentativa', async () => {
    uploadOverride = () => apiError('O arquivo excede o limite permitido.', 413);
    const user = await openWorkspace();
    await screen.findByText(/nenhum documento/i);
    await user.upload(fileInput(), new File(['conteudo'], 'grande.pdf'));
    await user.click(uploadButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('O arquivo excede o limite permitido.');
    expect(screen.queryByText(/enviado com sucesso/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Baixar grande.pdf' })).not.toBeInTheDocument();
    expect(fileInput().files).toHaveLength(1);
    expect(uploadButton()).toBeEnabled();
  });
});

describe('download de documento (RF-06, RF-07, RF-08)', () => {
  it('busca o arquivo com X-User-Id e inicia download binario com nome original', async () => {
    documentsByOwner.set('alice', [firstDocument]);
    const user = await openWorkspace();
    await screen.findByText(firstDocument.originalName);
    await user.click(downloadButton());
    await waitFor(() => expect(downloadedLinks).toHaveLength(1));
    const request = requests.find((entry) => entry.pathname.endsWith('/download'));
    expect(request.pathname).toBe(`/api/documents/${firstDocument.id}/download`);
    expect(request.method).toBe('GET');
    expect(request.owner).toBe('alice');
    expect(downloadedLinks[0]).toEqual({ href: 'blob:http://localhost/document-download', filename: 'relatorio.pdf' });
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(binaryContent);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/document-download'), { timeout: 3000 });
  });

  it('impede downloads duplicados enquanto aguarda a resposta', async () => {
    const pending = deferredResponse();
    downloadOverride = () => pending.promise;
    documentsByOwner.set('alice', [firstDocument]);
    const user = await openWorkspace();
    await screen.findByText(firstDocument.originalName);
    await user.click(downloadButton());
    expect(downloadButton()).toBeDisabled();
    await user.click(downloadButton());
    expect(requests.filter((request) => request.pathname.endsWith('/download'))).toHaveLength(1);
    pending.resolve(new Response(binaryContent));
    await waitFor(() => expect(downloadButton()).toBeEnabled());
  });

  it('mostra 404 sem iniciar download quando o arquivo nao esta disponivel', async () => {
    downloadOverride = () => apiError('Documento nao encontrado.', 404);
    documentsByOwner.set('alice', [firstDocument]);
    const user = await openWorkspace();
    await screen.findByText(firstDocument.originalName);
    await user.click(downloadButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Documento nao encontrado.');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(downloadedLinks).toHaveLength(0);
    expect(downloadButton()).toBeEnabled();
  });
});

describe('mensagens e recuperacao de falhas (RF-09)', () => {
  it('mostra erro da listagem e permite tentar novamente', async () => {
    listOverride = () => apiError('Nao foi possivel listar os documentos.', 500);
    const user = await openWorkspace();
    expect(await screen.findByRole('alert')).toHaveTextContent('Nao foi possivel listar os documentos.');
    listOverride = null;
    documentsByOwner.set('alice', [firstDocument]);
    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findByText(firstDocument.originalName)).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mostra mensagem compreensivel para falha de rede', async () => {
    listOverride = () => { throw new TypeError('fetch failed'); };
    await openWorkspace();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/conectar|rede|servidor|conex[aã]o/i);
    expect(alert).not.toHaveTextContent('fetch failed');
  });

  it('trata erro HTTP com corpo nao JSON', async () => {
    listOverride = () => new Response('<html>Bad gateway</html>', { status: 502 });
    await openWorkspace();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/502|servidor|opera[cç][aã]o/i);
    expect(alert).not.toHaveTextContent('<html>');
  });

  it('nao interpreta uma resposta de listagem malformada como lista vazia', async () => {
    listOverride = () => Response.json({ documents: null });
    await openWorkspace();
    expect(await screen.findByRole('alert')).toHaveTextContent(/lista|resposta|inv[aá]lid/i);
    expect(screen.queryByText(/nenhum documento/i)).not.toBeInTheDocument();
  });

  it('permite reenviar depois de uma falha de rede no upload', async () => {
    uploadOverride = () => { throw new TypeError('fetch failed'); };
    const user = await openWorkspace();
    await screen.findByText(/nenhum documento/i);
    await user.upload(fileInput(), new File(['conteudo'], 'novo.txt'));
    await user.click(uploadButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/conectar|rede|servidor|conex[aã]o/i);
    uploadOverride = null;
    await user.click(uploadButton());
    expect(await screen.findByRole('button', { name: 'Baixar novo.txt' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});