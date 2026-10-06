import { useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import { downloadDocument } from '../services/api.js';

export default function DownloadButton({ document, owner }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(null);
  const releaseRef = useRef(null);

  useEffect(() => () => {
    requestRef.current?.abort();
    releaseRef.current?.();
  }, []);

  async function handleDownload() {
    if (downloading) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setDownloading(true);
    setError('');
    try {
      const blob = await downloadDocument(document.id, owner, { signal: controller.signal });
      if (controller.signal.aborted) return;
      releaseRef.current?.();
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = document.originalName.replace(/[\\/\u0000-\u001f\u007f]/g, '_');
      window.document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        const timer = window.setTimeout(() => releaseRef.current?.(), 1000);
        releaseRef.current = () => {
          window.clearTimeout(timer);
          URL.revokeObjectURL(url);
          releaseRef.current = null;
        };
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
    } finally {
      if (!controller.signal.aborted) setDownloading(false);
    }
  }

  return (
    <div className="download-action">
      <button className="icon-button" type="button" onClick={handleDownload} disabled={downloading} title={downloading ? 'Baixando documento' : `Baixar ${document.originalName}`} aria-label={`Baixar ${document.originalName}`}>
        {downloading ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
      </button>
      {error && <p className="download-error" role="alert">{error}</p>}
    </div>
  );
}