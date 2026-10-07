const { randomUUID } = require('node:crypto');
const { mkdir } = require('node:fs/promises');
const multer = require('multer');
const { storageDirectory } = require('../config/storage');

const maxFileSize = Number(process.env.MAX_FILE_SIZE_BYTES || 10485760);
if (!Number.isSafeInteger(maxFileSize) || maxFileSize <= 0) {
  throw new Error('MAX_FILE_SIZE_BYTES deve ser um inteiro positivo.');
}

const receiveUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, callback) {
      mkdir(storageDirectory, { recursive: true })
        .then(() => callback(null, storageDirectory), callback);
    },
    filename(req, file, callback) {
      callback(null, randomUUID());
    },
  }),
  limits: { fileSize: maxFileSize + 1, files: 1, fields: 0, parts: 2 },
}).single('file');

module.exports = { receiveUpload };