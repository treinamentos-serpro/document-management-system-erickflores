import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FilePlus2, LoaderCircle, Upload } from 'lucide-react';
import { uploadDocument } from '../services/api.js';

export default function UploadComponent({ owner, onUploaded, disabled }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const inputRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file || uploading || disabled) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const document = await uploadDocument(file, owner, { signal: controller.signal });
      if (controller.signal.aborted) return;
      onUploaded(document);
      setSuccess(`${document.originalName} enviado com sucesso.`);
      setFile(null);
      inputRef.current.value = '';
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
    } finally {
      if (!controller.signal.aborted) setUploading(false);
    }
  }

  return (
    <section className="upload-section" aria-labelledby="upload-heading">
      <div className="section-heading"><div><span className="section-number">01</span><h2 id="upload-heading">Enviar documento</h2></div></div>
      <form className="upload-form" onSubmit={handleSubmit}>
        <label className={`file-picker${uploading || disabled ? ' is-disabled' : ''}`} htmlFor="document-file">
          <FilePlus2 size={30} strokeWidth={1.5} aria-hidden="true" />
          <span className="file-picker-copy"><strong>{file ? file.name : 'Selecionar documento'}</strong><span>{file ? `${file.size.toLocaleString('pt-BR')} bytes` : 'Nenhum arquivo selecionado'}</span></span>
          <input id="document-file" ref={inputRef} aria-label="Selecionar documento" type="file" disabled={uploading || disabled} onChange={(event) => {
            setFile(event.target.files[0] || null);
            setError('');
            setSuccess('');
          }} />
        </label>
        <button className="button button-primary" type="submit" disabled={!file || uploading || disabled}>
          {uploading ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <Upload size={18} aria-hidden="true" />}
          {uploading ? 'Enviando...' : 'Enviar documento'}
        </button>
      </form>
      {error && <p className="message error-message" role="alert">{error}</p>}
      {success && <p className="message success-message" role="status"><CheckCircle2 size={16} aria-hidden="true" />{success}</p>}
    </section>
  );
}