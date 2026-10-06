const multer = require('multer');
const service = require('../services/documents.service');

const maxFileSize = Number(process.env.MAX_FILE_SIZE_BYTES || 10485760);
if (!Number.isSafeInteger(maxFileSize) || maxFileSize <= 0) {
  throw new Error('MAX_FILE_SIZE_BYTES deve ser um inteiro positivo.');
}

const receiveUpload = multer({
  storage: service.createUploadStorage(),
  limits: { fileSize: maxFileSize + 1, files: 1 },
}).single('file');

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function validateOwner(req, res, next) {
  const owner = req.get('X-User-Id')?.trim();
  if (!owner) {
    return sendError(res, 400, 'INVALID_USER', 'Informe o cabecalho X-User-Id.');
  }
  res.locals.owner = owner;
  next();
}

async function upload(req, res) {
  if (!req.file) {
    return sendError(res, 400, 'FILE_REQUIRED', 'Envie um arquivo no campo file.');
  }
  const document = await service.upload(req.file, res.locals.owner);
  res.status(201).json(document);
}

function list(req, res) {
  res.json({ documents: service.list(res.locals.owner) });
}

async function download(req, res, next) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return sendError(res, 400, 'INVALID_ID', 'Identificador de documento invalido.');
  }
  const document = await service.download(req.params.id, res.locals.owner);
  res.type(document.mimeType);
  res.download(document.filePath, document.originalName, (error) => {
    if (!error) return;
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      error.code = 'DOCUMENT_NOT_FOUND';
    }
    next(error);
  });
}

function handleError(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 413, 'FILE_TOO_LARGE', 'O arquivo excede o limite permitido.');
    }
    return sendError(res, 400, 'INVALID_UPLOAD', 'Envie apenas um arquivo no campo file.');
  }
  if (error.code === 'DOCUMENT_NOT_FOUND') {
    return sendError(res, 404, 'DOCUMENT_NOT_FOUND', 'Documento nao encontrado.');
  }
  if (error.message === 'Unexpected end of form' || error.message === 'Multipart: Boundary not found' ||
      error.message === 'Malformed part header' || error.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_REQUEST', 'Requisicao invalida.');
  }
  return sendError(res, 500, 'INTERNAL_ERROR', 'Nao foi possivel concluir a operacao.');
}

module.exports = { validateOwner, receiveUpload, upload, list, download, handleError };