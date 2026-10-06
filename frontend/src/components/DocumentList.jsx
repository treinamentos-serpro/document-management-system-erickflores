import { FileText, FolderOpen, LoaderCircle, RefreshCw } from 'lucide-react';
import DownloadButton from './DownloadButton.jsx';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const sizeFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFormatter.format(bytes / 1024)} KB`;
  return `${sizeFormatter.format(bytes / (1024 * 1024))} MB`;
}

export default function DocumentList({ documents, owner, loading, error, onRefresh }) {
  return (
    <section className="documents-section" aria-labelledby="documents-heading" aria-busy={loading}>
      <div className="section-heading">
        <div><span className="section-number">02</span><h2 id="documents-heading">Meus documentos</h2><span className="document-count">{documents.length}</span></div>
        <button className="icon-button" type="button" title="Atualizar lista" aria-label="Atualizar lista" onClick={onRefresh} disabled={!owner || loading}><RefreshCw size={18} className={loading ? 'spin' : ''} aria-hidden="true" /></button>
      </div>
      {loading ? <div className="empty-state" role="status"><LoaderCircle size={28} className="spin" aria-hidden="true" /><p>Carregando documentos...</p></div>
        : error ? <div className="list-feedback"><p className="message error-message" role="alert">{error}</p><button className="button button-secondary" type="button" onClick={onRefresh}><RefreshCw size={16} aria-hidden="true" />Tentar novamente</button></div>
          : documents.length === 0 ? <div className="empty-state"><FolderOpen size={42} strokeWidth={1.2} aria-hidden="true" /><p>Nenhum documento</p></div>
            : <>
              <div className="list-columns" aria-hidden="true"><span>Nome</span><span>Tamanho</span><span>Enviado em</span><span>Ações</span></div>
              <ul className="document-list">{documents.map((document) => (
                <li key={document.id} className="document-row">
                  <div className="document-identity"><span className="document-icon"><FileText size={22} strokeWidth={1.5} aria-hidden="true" /></span><span className="document-name" title={document.originalName}>{document.originalName}</span></div>
                  <span className="document-size">{formatSize(document.size)}</span>
                  <time className="document-date" dateTime={document.uploadedAt}>{dateFormatter.format(new Date(document.uploadedAt))}</time>
                  <DownloadButton document={document} owner={owner} />
                </li>
              ))}</ul>
            </>}
    </section>
  );
}