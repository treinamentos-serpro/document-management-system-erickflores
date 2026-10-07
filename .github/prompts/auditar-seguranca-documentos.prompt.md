---
description: Revisa riscos de segurança no upload, armazenamento e download de documentos.
name: auditar-seguranca-documentos
argument-hint: escopo opcional (ex. backend/src/services/documents.service.js)
agent: agent
---

# Auditoria de segurança do DMS

Revise o fluxo de documentos do projeto, considerando o escopo `${input:escopo:todo o fluxo de documentos}`. Use as instruções do projeto e a especificação em `docs/specs/dms-spec.md` como fonte de requisitos.

Adapte para este projeto a abordagem de revisão focada em risco do agente [SE Security Reviewer](https://github.com/github/awesome-copilot/blob/main/agents/se-security-reviewer.agent.md): selecione as áreas de análise mais relevantes, explique cenários de impacto e recomende validações. Use também as orientações OWASP da comunidade sobre uploads e path traversal, sem copiar regras de outras stacks sem verificar sua aplicabilidade.

Verifique, quando relevante:

- Validação de entrada e limites de tamanho/tipo no Multer; não confie apenas no nome ou MIME type informado pelo cliente.
- Uso de nomes de arquivo controlados pelo servidor e proteção contra path traversal nas operações de filesystem.
- Restrição de leitura e gravação à pasta local `backend/storage`.
- Isolamento dos documentos por usuário, incluindo validação do `X-User-Id` e autorização no download.
- Tratamento de erros e limpeza de arquivos temporários quando uma operação falhar.
- Testes para entradas inválidas, acesso a documentos de outro usuário e falhas de filesystem.

Trace dados não confiáveis pelas camadas `routes -> controllers -> services -> repositories`. Não presuma vulnerabilidades: confira validações existentes, controles do framework e requisitos do produto antes de reportar. Não recomende armazenamento externo, banco de dados ou dependências novas, pois os requisitos atuais determinam filesystem local e metadados em memória.

Não altere arquivos. Apresente os achados em ordem de severidade. Para cada achado, informe:

1. Severidade e arquivo/localização exata.
2. Evidência no código e cenário de impacto.
3. Correção mínima compatível com a arquitetura e as restrições do projeto.
4. Teste recomendado para confirmar a correção.

Se não encontrar problemas, informe o escopo examinado e os riscos residuais; não invente achados.