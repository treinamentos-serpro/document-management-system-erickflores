import { useEffect, useState } from 'react';
import { ArrowRight, FolderOpen, HardDrive, Layers, UserRound } from 'lucide-react';
import UploadComponent from './components/UploadComponent.jsx';
import DocumentList from './components/DocumentList.jsx';
import { listDocuments } from './services/api.js';
import './App.css';

export default function App() {
  const [owner, setOwner] = useState('');
  const [ownerInput, setOwnerInput] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    listDocuments(owner, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setDocuments(result);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [owner, refreshVersion]);

  function refreshDocuments() {
    setRefreshVersion((version) => version + 1);
  }

  function handleOwnerChange(event) {
    event.preventDefault();
    const nextOwner = ownerInput.trim();
    if (!nextOwner || nextOwner === owner) return;
    setDocuments([]);
    setError('');
    setLoading(true);
    setOwner(nextOwner);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="DMS, início"><Layers size={28} strokeWidth={1.7} aria-hidden="true" /><span>DMS<span className="brand-caption">Document Management System</span></span></a>
        <span className="storage-status"><HardDrive size={15} aria-hidden="true" />Armazenamento local</span>
      </header>
      <main className="workspace">
        <div className="page-heading"><div><span className="eyebrow"><FolderOpen size={16} aria-hidden="true" />ARQUIVO PESSOAL</span><h1>Documentos</h1></div><span className="workspace-caption">Workspace / Documentos</span></div>
        <form className="owner-form" onSubmit={handleOwnerChange}>
          <UserRound size={18} aria-hidden="true" /><label htmlFor="owner">Usuário</label>
          <input id="owner" placeholder="Identificador" value={ownerInput} onChange={(event) => setOwnerInput(event.target.value)} required autoComplete="off" />
          <button className="button button-secondary" type="submit" disabled={!ownerInput.trim()}><ArrowRight size={16} aria-hidden="true" />Abrir</button>
          <span className={`active-owner${owner ? ' is-active' : ''}`} title={owner || undefined}>{owner ? `Atual: ${owner}` : 'Nenhum usuário ativo'}</span>
        </form>
        <UploadComponent key={owner} owner={owner} onUploaded={refreshDocuments} disabled={!owner || loading} />
        <DocumentList documents={documents} owner={owner} loading={loading} error={error} onRefresh={refreshDocuments} />
      </main>
      <footer className="app-footer"><span>DMS</span><span>Arquivo local</span></footer>
    </div>
  );
}
