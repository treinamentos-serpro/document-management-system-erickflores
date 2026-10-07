const { test } = require('node:test');
const assert = require('node:assert');
const { randomUUID } = require('node:crypto');
const { mkdir, readFile, readdir, unlink } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const previousLimit = process.env.MAX_FILE_SIZE_BYTES;
const uploadLimit = 1024;
process.env.MAX_FILE_SIZE_BYTES = String(uploadLimit);
const app = require('../src/app');
const repository = require('../src/repositories/documents.repository');
if (previousLimit === undefined) delete process.env.MAX_FILE_SIZE_BYTES;
else process.env.MAX_FILE_SIZE_BYTES = previousLimit;

test('o app backend é exportado', () => {
  assert.ok(app, 'o app deve estar definido');
  assert.strictEqual(typeof app, 'function', 'o app Express deve ser uma função');
});

test('contratos da API definidos na especificacao do DMS', async (context) => {
  const storageDirectory = path.resolve(__dirname, '../storage');
  await mkdir(storageDirectory, { recursive: true });
  const storedFiles = new Set();
  const originalSave = repository.save;
  context.mock.method(repository, 'save', (document) => {
    storedFiles.add(document.storageName);
    return originalSave(document);
  });
  context.after(async () => {
    for (const filename of storedFiles) {
      await unlink(path.join(storageDirectory, filename)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  });

  const server = app.listen(0, '127.0.0.1');
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const headersFor = (owner) => ({ 'X-User-Id': owner });

  function sendUpload(owner, { content = 'conteudo', filename = 'documento.txt', field = 'file', mimeType = 'text/plain' } = {}) {
    const body = new FormData();
    body.append(field, new Blob([content], { type: mimeType }), filename);
    return fetch(`${baseUrl}/upload`, { method: 'POST', headers: headersFor(owner), body });
  }

  async function createDocument(owner, options) {
    const response = await sendUpload(owner, options);
    assert.strictEqual(response.status, 201);
    return response.json();
  }

  async function assertError(response, status, code) {
    assert.strictEqual(response.status, status);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    const payload = await response.json();
    assert.deepStrictEqual(Object.keys(payload), ['error']);
    assert.deepStrictEqual(Object.keys(payload.error).sort(), ['code', 'message']);
    assert.strictEqual(payload.error.code, code);
    assert.strictEqual(typeof payload.error.message, 'string');
    assert.ok(payload.error.message.length > 0);
    assert.ok(!JSON.stringify(payload).includes(storageDirectory));
    assert.ok(!JSON.stringify(payload).includes('detalhe-interno'));
    return payload;
  }

  await context.test('preserva GET /health', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { status: 'ok' });
  });

  await context.test('exige X-User-Id nao vazio nas tres rotas antes de gravar', async () => {
    const before = await readdir(storageDirectory);
    for (const headers of [{}, headersFor('   ')]) {
      const body = new FormData();
      body.append('file', new Blob(['conteudo']), 'documento.txt');
      await assertError(await fetch(`${baseUrl}/upload`, { method: 'POST', headers, body }), 400, 'INVALID_USER');
      await assertError(await fetch(`${baseUrl}/documents`, { headers }), 400, 'INVALID_USER');
      await assertError(await fetch(`${baseUrl}/documents/${randomUUID()}/download`, { headers }), 400, 'INVALID_USER');
    }
    assert.deepStrictEqual(await readdir(storageDirectory), before);
  });

  await context.test('aceita lista vazia para usuario sem documentos', async () => {
    const response = await fetch(`${baseUrl}/documents`, { headers: headersFor(randomUUID()) });
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { documents: [] });
  });

  await context.test('retorna somente metadados publicos e grava conteudo no storage local', async () => {
    const owner = randomUUID();
    const beforeUpload = Date.now();
    const document = await createDocument(owner);
    assert.deepStrictEqual(Object.keys(document).sort(), ['id', 'mimeType', 'originalName', 'owner', 'size', 'uploadedAt']);
    assert.match(document.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.strictEqual(document.originalName, 'documento.txt');
    assert.strictEqual(document.size, Buffer.byteLength('conteudo'));
    assert.strictEqual(document.owner, owner);
    assert.strictEqual(document.mimeType, 'text/plain');
    assert.strictEqual(new Date(document.uploadedAt).toISOString(), document.uploadedAt);
    assert.ok(Date.parse(document.uploadedAt) >= beforeUpload);
    assert.ok(Date.parse(document.uploadedAt) <= Date.now());
    const internal = repository.findById(document.id);
    assert.match(internal.storageName, /^[0-9a-f-]{36}$/);
    assert.notStrictEqual(internal.storageName, document.originalName);
    assert.strictEqual(await readFile(path.join(storageDirectory, internal.storageName), 'utf8'), 'conteudo');
  });

  await context.test('gera IDs e nomes internos diferentes para arquivos com mesmo nome', async () => {
    const owner = randomUUID();
    const first = await createDocument(owner, { content: 'primeiro' });
    const second = await createDocument(owner, { content: 'segundo' });
    assert.notStrictEqual(first.id, second.id);
    const firstStored = repository.findById(first.id).storageName;
    const secondStored = repository.findById(second.id).storageName;
    assert.notStrictEqual(firstStored, secondStored);
    assert.strictEqual(await readFile(path.join(storageDirectory, firstStored), 'utf8'), 'primeiro');
    assert.strictEqual(await readFile(path.join(storageDirectory, secondStored), 'utf8'), 'segundo');
  });

  await context.test('nao usa caminhos do cliente como caminho de armazenamento', async () => {
    const document = await createDocument(randomUUID(), { filename: '../../relatorio.txt' });
    const internal = repository.findById(document.id);
    assert.match(internal.storageName, /^[0-9a-f-]{36}$/);
    assert.strictEqual(path.dirname(await repository.getFilePath(internal.storageName)), storageDirectory);
    assert.strictEqual(document.originalName, 'relatorio.txt');
  });

  await context.test('lista somente documentos do proprietario sem campos internos', async () => {
    const owner = randomUUID();
    const otherOwner = randomUUID();
    const first = await createDocument(owner);
    const second = await createDocument(owner);
    await createDocument(otherOwner);
    const response = await fetch(`${baseUrl}/documents`, { headers: headersFor(owner) });
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await response.json(), { documents: [first, second] });
  });

  await context.test('baixa bytes originais como anexo com MIME e nome original', async () => {
    const owner = randomUUID();
    const content = Buffer.from([0, 255, 1, 128, 13, 10]);
    const document = await createDocument(owner, { content, filename: 'arquivo.bin', mimeType: 'application/octet-stream' });
    const response = await fetch(`${baseUrl}/documents/${document.id}/download`, { headers: headersFor(owner) });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('content-type'), 'application/octet-stream');
    assert.strictEqual(response.headers.get('content-disposition'), 'attachment; filename="arquivo.bin"');
    assert.deepStrictEqual(Buffer.from(await response.arrayBuffer()), content);
  });

  await context.test('protege separadores do nome no cabecalho de download', async () => {
    const owner = randomUUID();
    const document = await createDocument(owner, { filename: 'relatorio; filename=outro.txt' });
    const response = await fetch(`${baseUrl}/documents/${document.id}/download`, { headers: headersFor(owner) });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('content-disposition'), 'attachment; filename="relatorio; filename=outro.txt"');
    assert.strictEqual(await response.text(), 'conteudo');
  });

  await context.test('nao distingue documento inexistente de documento de outro usuario', async () => {
    const owner = randomUUID();
    const document = await createDocument(randomUUID());
    const denied = await assertError(await fetch(`${baseUrl}/documents/${document.id}/download`, { headers: headersFor(owner) }), 404, 'DOCUMENT_NOT_FOUND');
    const unknown = await assertError(await fetch(`${baseUrl}/documents/${randomUUID()}/download`, { headers: headersFor(owner) }), 404, 'DOCUMENT_NOT_FOUND');
    assert.deepStrictEqual(denied, unknown);
  });

  await context.test('rejeita identificadores malformados', async () => {
    for (const id of ['invalido', '123', 'id/fora', '00000000-0000-0000-0000-000000000000']) {
      await assertError(await fetch(`${baseUrl}/documents/${encodeURIComponent(id)}/download`, { headers: headersFor(randomUUID()) }), 400, 'INVALID_ID');
    }
  });

  await context.test('retorna 404 quando o arquivo fisico nao esta disponivel', async () => {
    const owner = randomUUID();
    const document = await createDocument(owner);
    await unlink(path.join(storageDirectory, repository.findById(document.id).storageName));
    await assertError(await fetch(`${baseUrl}/documents/${document.id}/download`, { headers: headersFor(owner) }), 404, 'DOCUMENT_NOT_FOUND');
  });

  await context.test('rejeita upload sem arquivo', async () => {
    await assertError(await fetch(`${baseUrl}/upload`, { method: 'POST', headers: headersFor(randomUUID()) }), 400, 'FILE_REQUIRED');
  });

  await context.test('rejeita campo incorreto e varios arquivos sem deixar residuos', async () => {
    const owner = randomUUID();
    const before = await readdir(storageDirectory);
    await assertError(await sendUpload(owner, { field: 'attachment' }), 400, 'INVALID_UPLOAD');
    const body = new FormData();
    body.append('file', new Blob(['primeiro']), 'primeiro.txt');
    body.append('file', new Blob(['segundo']), 'segundo.txt');
    await assertError(await fetch(`${baseUrl}/upload`, { method: 'POST', headers: headersFor(owner), body }), 400, 'INVALID_UPLOAD');
    assert.deepStrictEqual(await readdir(storageDirectory), before);
    assert.deepStrictEqual(repository.findByOwner(owner), []);
  });

  await context.test('rejeita campos multipart adicionais sem deixar residuos', async () => {
    const owner = randomUUID();
    const before = await readdir(storageDirectory);
    const body = new FormData();
    body.append('file', new Blob(['conteudo']), 'documento.txt');
    body.append('metadata', 'x'.repeat(1024));
    await assertError(await fetch(`${baseUrl}/upload`, { method: 'POST', headers: headersFor(owner), body }), 400, 'INVALID_UPLOAD');
    assert.deepStrictEqual(await readdir(storageDirectory), before);
    assert.deepStrictEqual(repository.findByOwner(owner), []);
  });

  await context.test('aceita arquivo imediatamente abaixo do limite configurado', async () => {
    const document = await createDocument(randomUUID(), { content: Buffer.alloc(uploadLimit - 1) });
    assert.strictEqual(document.size, uploadLimit - 1);
  });

  await context.test('aceita arquivo com tamanho exatamente igual ao limite', async () => {
    const document = await createDocument(randomUUID(), { content: Buffer.alloc(uploadLimit) });
    assert.strictEqual(document.size, uploadLimit);
  });

  await context.test('retorna 413 acima do limite e remove arquivo parcial', async () => {
    const owner = randomUUID();
    const before = await readdir(storageDirectory);
    await assertError(await sendUpload(owner, { content: Buffer.alloc(uploadLimit + 1) }), 413, 'FILE_TOO_LARGE');
    assert.deepStrictEqual(await readdir(storageDirectory), before);
    assert.deepStrictEqual(repository.findByOwner(owner), []);
  });

  await context.test('responde em JSON para multipart e JSON malformados', async () => {
    const headers = headersFor(randomUUID());
    await assertError(await fetch(`${baseUrl}/upload`, { method: 'POST', headers: { ...headers, 'Content-Type': 'multipart/form-data' }, body: 'invalido' }), 400, 'INVALID_REQUEST');
    await assertError(await fetch(`${baseUrl}/upload`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{' }), 400, 'INVALID_REQUEST');
  });

  await context.test('remove arquivo se o registro falhar sem expor detalhes internos', async (subtest) => {
    const owner = randomUUID();
    const before = await readdir(storageDirectory);
    subtest.mock.method(repository, 'save', () => {
      throw Object.assign(new Error('detalhe-interno: falha de registro'), { code: 'ENOENT' });
    });
    const removeMock = subtest.mock.method(repository, 'removeFile');
    await assertError(await sendUpload(owner), 500, 'INTERNAL_ERROR');
    assert.strictEqual(removeMock.mock.callCount(), 1);
    assert.deepStrictEqual(await readdir(storageDirectory), before);
    assert.deepStrictEqual(repository.findByOwner(owner), []);
  });

  await context.test('trata falha inesperada de leitura como 500 sem detalhes internos', async (subtest) => {
    const owner = randomUUID();
    const document = await createDocument(owner);
    subtest.mock.method(repository, 'getFilePath', async () => {
      throw Object.assign(new Error('detalhe-interno: sem permissao'), { code: 'EACCES' });
    });
    await assertError(await fetch(`${baseUrl}/documents/${document.id}/download`, { headers: headersFor(owner) }), 500, 'INTERNAL_ERROR');
  });

  await context.test('trata falha inesperada de listagem como 500', async (subtest) => {
    subtest.mock.method(repository, 'findByOwner', () => { throw new Error('detalhe-interno: falha de listagem'); });
    await assertError(await fetch(`${baseUrl}/documents`, { headers: headersFor(randomUUID()) }), 500, 'INTERNAL_ERROR');
  });

  await context.test('metadados nao sobrevivem a um novo processo e arquivos permanecem', async () => {
    const owner = randomUUID();
    const document = await createDocument(owner);
    const result = spawnSync(process.execPath, ['-e', `const repository = require('./src/repositories/documents.repository'); process.stdout.write(JSON.stringify(repository.findByOwner(${JSON.stringify(owner)})));`], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000,
    });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(JSON.parse(result.stdout), []);
    assert.strictEqual(await readFile(path.join(storageDirectory, repository.findById(document.id).storageName), 'utf8'), 'conteudo');
  });

  await context.test('usa MIME padrao quando o recebimento nao fornece tipo', async (subtest) => {
    const service = require('../src/services/documents.service');
    let saved;
    subtest.mock.method(repository, 'save', (document) => { saved = document; return document; });
    const document = await service.upload({ originalname: 'arquivo', size: 0, filename: randomUUID() }, randomUUID());
    assert.strictEqual(document.mimeType, 'application/octet-stream');
    assert.strictEqual(saved.mimeType, 'application/octet-stream');
    assert.ok(!Object.hasOwn(document, 'storageName'));
  });
});

test('aplica limite padrao de 10 MiB quando MAX_FILE_SIZE_BYTES esta ausente', () => {
  const environment = { ...process.env };
  delete environment.MAX_FILE_SIZE_BYTES;
  const result = spawnSync(process.execPath, ['-e', `
    const app = require('./src/app');
    const repository = require('./src/repositories/documents.repository');
    const { randomUUID } = require('node:crypto');
    const owner = randomUUID();
    const server = app.listen(0, '127.0.0.1');
    server.once('listening', async () => {
      let storedDocument;
      try {
        async function upload(size) {
          const body = new FormData();
          body.append('file', new Blob([Buffer.alloc(size)]), 'limite.bin');
          return fetch('http://127.0.0.1:' + server.address().port + '/upload', {
            method: 'POST', headers: { 'X-User-Id': owner }, body,
          });
        }
        const accepted = await upload(10485759);
        if (accepted.status === 201) {
          storedDocument = repository.findById((await accepted.json()).id);
        }
        const rejected = await upload(10485761);
        process.stdout.write(JSON.stringify([accepted.status, rejected.status]));
      } catch (error) {
        console.error(error);
        process.exitCode = 1;
      } finally {
        try {
          if (storedDocument) await repository.removeFile(storedDocument.storageName);
        } finally {
          server.close();
          server.closeAllConnections();
        }
      }
    });
  `], {
    cwd: path.resolve(__dirname, '..'), env: environment,
    encoding: 'utf8', timeout: 30000,
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.deepStrictEqual(JSON.parse(result.stdout), [201, 413]);
});

test('rejeita configuracao invalida de MAX_FILE_SIZE_BYTES na inicializacao', () => {
  for (const value of ['0', '-1', '1.5', 'invalido']) {
    const result = spawnSync(process.execPath, ['-e', "require('./src/app')"], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, MAX_FILE_SIZE_BYTES: value },
      encoding: 'utf8', timeout: 10000,
    });
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /MAX_FILE_SIZE_BYTES/);
  }
});
