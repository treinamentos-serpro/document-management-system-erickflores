const { randomUUID } = require('node:crypto');
const repository = require('../repositories/documents.repository');

function publicMetadata(document) {
  const { storageName, ...metadata } = document;
  return metadata;
}

async function upload(file, owner) {
  try {
    const document = await repository.save({
      id: randomUUID(),
      originalName: file.originalname,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      owner,
      mimeType: file.mimetype || 'application/octet-stream',
      storageName: file.filename,
    });
    return publicMetadata(document);
  } catch (error) {
    await repository.removeFile(file.filename);
    throw error;
  }
}

function list(owner) {
  return repository.findByOwner(owner).map(publicMetadata);
}

async function download(id, owner) {
  const document = repository.findById(id);
  if (!document || document.owner !== owner) {
    throw Object.assign(new Error('Documento nao encontrado.'), { code: 'DOCUMENT_NOT_FOUND' });
  }
  try {
    const filePath = await repository.getFilePath(document.storageName);
    return { filePath, originalName: document.originalName, mimeType: document.mimeType };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      throw Object.assign(new Error('Documento nao encontrado.'), { code: 'DOCUMENT_NOT_FOUND' });
    }
    throw error;
  }
}

module.exports = { upload, list, download };