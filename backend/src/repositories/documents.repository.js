const { randomUUID } = require('node:crypto');
const { mkdir, stat, unlink } = require('node:fs/promises');
const path = require('node:path');
const multer = require('multer');

const storageDirectory = path.resolve(__dirname, '../../storage');
const documents = new Map();

function createUploadStorage() {
  return multer.diskStorage({
    destination(req, file, callback) {
      mkdir(storageDirectory, { recursive: true })
        .then(() => callback(null, storageDirectory), callback);
    },
    filename(req, file, callback) {
      callback(null, randomUUID());
    },
  });
}

function save(document) {
  documents.set(document.id, document);
  return document;
}

function findByOwner(owner) {
  return [...documents.values()].filter((document) => document.owner === owner);
}

function findById(id) {
  return documents.get(id);
}

async function getFilePath(storageName) {
  const filePath = path.join(storageDirectory, storageName);
  const file = await stat(filePath);
  if (!file.isFile()) {
    throw Object.assign(new Error('Arquivo indisponivel.'), { code: 'ENOENT' });
  }
  return filePath;
}

async function removeFile(storageName) {
  try {
    await unlink(path.join(storageDirectory, storageName));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = { createUploadStorage, save, findByOwner, findById, getFilePath, removeFile };