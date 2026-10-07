const express = require('express');
const controller = require('../controllers/documents.controller');
const { receiveUpload } = require('../middleware/documents-upload.middleware');

const router = express.Router();

router.post('/upload', controller.validateOwner, receiveUpload, controller.upload);
router.get('/documents', controller.validateOwner, controller.list);
router.get('/documents/:id/download', controller.validateOwner, controller.download);

module.exports = router;