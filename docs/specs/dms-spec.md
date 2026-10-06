# Especificação - Document Management System

## 1. Objetivo

Entregar uma aplicação web para usuários enviarem documentos, consultarem os próprios documentos e baixá-los, com arquivos no filesystem local e metadados mantidos em memória nesta fase.

## 2. Escopo

### Dentro do escopo

- Envio de um arquivo por requisição.
- Listagem dos documentos associados ao usuário informado na requisição.
- Download de um documento existente pertencente ao usuário.
- Identificação simples do proprietário por documento.
- Armazenamento dos arquivos no filesystem local da aplicação, usando Multer com `diskStorage`.
- Armazenamento dos metadados em memória durante a execução do backend.
- Interface web para upload, listagem e download, consumindo a API por `fetch`.

### Fora do escopo

- Armazenamento em nuvem, serviços de terceiros ou outro provedor externo.
- Banco de dados ou persistência dos metadados após reiniciar o processo.
- Versionamento, edição, compartilhamento ou exclusão de documentos.
- Cadastro, autenticação e gestão de credenciais de usuários.
- Varredura antivírus ou classificação de conteúdo dos arquivos.

## 3. Requisitos funcionais

| ID | Requisito |
| --- | --- |
| RF-01 | O usuário pode enviar um único arquivo por vez usando `multipart/form-data`, no campo `file`. |
| RF-02 | O sistema deve rejeitar o envio quando o arquivo estiver ausente ou exceder o limite configurado. |
| RF-03 | O sistema deve gerar um identificador único e um nome interno seguro para armazenar cada arquivo, sem usar o nome fornecido pelo cliente como caminho. |
| RF-04 | Após salvar o arquivo, o sistema deve registrar seus metadados em memória, incluindo proprietário e data/hora de upload em ISO 8601. |
| RF-05 | O usuário pode listar somente os documentos associados ao identificador de usuário recebido na requisição. |
| RF-06 | O usuário pode baixar um documento pelo identificador somente quando o documento existir e pertencer a esse usuário. |
| RF-07 | O download deve ser apresentado como anexo e usar o nome original do arquivo, tratado de forma segura no cabeçalho HTTP. |
| RF-08 | A interface deve exibir o resultado de upload, listar os documentos retornados e oferecer o download de cada item. |
| RF-09 | A interface deve apresentar mensagens compreensíveis para falhas de validação, rede e respostas de erro da API. |

### Identificação do usuário

Nesta fase, o identificador do usuário é recebido pelo backend no cabeçalho `X-User-Id`. Esse valor é um identificador de associação, não uma credencial: sem autenticação, o backend não pode confirmar a identidade de quem o enviou. A integração futura com autenticação deve substituir a confiança direta nesse cabeçalho antes de expor o sistema a usuários não confiáveis.

## 4. Requisitos não funcionais

| ID | Requisito |
| --- | --- |
| RNF-01 | Os arquivos devem ser gravados localmente em `backend/storage` usando Multer configurado com `diskStorage`; armazenamento externo é proibido. |
| RNF-02 | Os metadados devem permanecer em memória e ser acessados pela camada de repositório. |
| RNF-03 | Reiniciar o backend elimina os metadados em memória. Arquivos já gravados podem permanecer sem referência; persistência e reconciliação desses arquivos não fazem parte desta fase. |
| RNF-04 | A configuração operacional deve usar variáveis de ambiente, incluindo `PORT` e `MAX_FILE_SIZE_BYTES`. O limite padrão de upload é 10 MiB (`10485760` bytes). |
| RNF-05 | O backend deve tratar erros de entrada, upload e filesystem sem expor stack traces, caminhos locais ou detalhes internos ao cliente. |
| RNF-06 | A implementação deve usar Node.js, Express e JavaScript CommonJS no backend; React, Vite e JavaScript ESM no frontend. |
| RNF-07 | Os testes do backend devem usar o runner nativo `node:test`. |
| RNF-08 | A solução deve seguir SOLID, DRY, KISS e YAGNI, preferindo as dependências já existentes no projeto. |

## 5. Modelo de dados

### Metadados do documento

| Campo | Tipo | Exposição | Descrição |
| --- | --- | --- | --- |
| `id` | string | API | Identificador único, gerado pelo servidor. |
| `originalName` | string | API | Nome original enviado pelo cliente; nunca deve ser usado diretamente como caminho no filesystem. |
| `size` | number | API | Tamanho do arquivo em bytes. |
| `uploadedAt` | string | API | Data e hora do upload em formato ISO 8601. |
| `owner` | string | API | Identificador recebido em `X-User-Id`. |
| `mimeType` | string | API | Tipo de mídia informado/detectado no recebimento; usar `application/octet-stream` quando indisponível. |
| `storageName` | string | Interno | Nome opaco usado para localizar o arquivo em `backend/storage`; não retornar ao cliente. |

Os registros devem ser mantidos em uma estrutura em memória indexada por `id`. A camada de serviço não deve depender da estrutura concreta escolhida pelo repositório. O arquivo físico e os metadados são recursos distintos: operações que falharem após a gravação devem tentar remover o arquivo recém-criado para evitar resíduos.

## 6. Contratos de API

O caminho-base do backend não inclui `/api`. Em desenvolvimento, o frontend pode chamar `/api/...`; a configuração do Vite remove esse prefixo antes de encaminhar a requisição ao backend.

### Convenções comuns

- Requisições de upload, listagem e download devem incluir `X-User-Id` não vazio.
- Respostas de erro usam JSON no formato `{ "error": { "code": "...", "message": "..." } }`.
- Nomes, caminhos internos e stack traces do filesystem não devem ser expostos.

### `POST /upload`

- Cabeçalho: `X-User-Id: <identificador>`.
- Entrada: `multipart/form-data` com exatamente um arquivo no campo `file`.
- Limite: `MAX_FILE_SIZE_BYTES`, com padrão de 10 MiB.
- Sucesso: `201 Created`, corpo JSON com os metadados públicos do documento (`id`, `originalName`, `size`, `uploadedAt`, `owner`, `mimeType`).
- Erros: `400` para arquivo ausente ou requisição inválida; `413` para arquivo acima do limite; `500` para falha inesperada de gravação ou registro.

### `GET /documents`

- Cabeçalho: `X-User-Id: <identificador>`.
- Sucesso: `200 OK`, corpo `{ "documents": [...] }`, contendo somente documentos daquele proprietário. Lista vazia é válida.
- Erros: `400` se o identificador do usuário estiver ausente ou vazio; `500` para falha inesperada.

### `GET /documents/:id/download`

- Cabeçalho: `X-User-Id: <identificador>`.
- Sucesso: `200 OK`, conteúdo binário do arquivo, com `Content-Type` e `Content-Disposition: attachment` apropriados.
- Erros: `400` para identificador malformado ou usuário ausente; `404` quando o documento não existir, não pertencer ao usuário ou o arquivo local não estiver disponível; `500` para falha inesperada de leitura.
- Respostas `404` não devem distinguir documento inexistente de documento pertencente a outro usuário.

## 7. Decisões arquiteturais

### Backend

O fluxo de dependências é unidirecional: `routes -> controllers -> services -> repositories`.

- **Routes:** declaram os caminhos HTTP, aplicam os middlewares necessários e delegam para controllers. Não implementam regras de negócio.
- **Controllers:** validam aspectos básicos da entrada HTTP, extraem arquivo, identificador e cabeçalhos, chamam services e convertem resultados em status e respostas HTTP.
- **Services:** concentram regras de upload, associação ao proprietário, listagem, autorização de acesso por proprietário e download. Não conhecem Express nem detalhes de armazenamento.
- **Repositories:** encapsulam o registro de metadados em memória e as operações de acesso aos arquivos locais. O filesystem fica restrito a essa fronteira de persistência.
- **Multer:** middleware de entrada configurado com `diskStorage`; grava em `backend/storage` com nome interno gerado pelo servidor. O nome original é mantido apenas como metadado.
- **Composição da aplicação:** Express conecta rotas e middleware e mantém o endpoint de saúde existente.

Camadas internas não devem importar ou conhecer camadas externas. Erros devem ser tratados na fronteira HTTP e convertidos para o formato de erro definido nesta especificação.

### Frontend

- Componentes funcionais com React Hooks, organizados pelas convenções existentes de `components/`, `pages/` e `services/`.
- Um serviço de API usa `fetch` e o prefixo `/api`, encaminhado pelo proxy do Vite para o backend.
- A interface oferece seleção/envio de arquivo, listagem e comando de download; estados de carregamento, lista vazia e erro devem ser representados.
- Símbolos de código em inglês; mensagens ao usuário e comentários em português.

### Limites e riscos conhecidos

- O cabeçalho `X-User-Id` não autentica o usuário e só é adequado ao escopo inicial controlado.
- Metadados em memória não sobrevivem a reinicializações; arquivos locais podem ficar órfãos.
- O limite de tamanho é configurável; não há restrição por extensão ou tipo de mídia nesta fase.

## 8. Plano de execução

As etapas abaixo são marcos futuros de implementação, não uma autorização para editar código neste trabalho. A entrega desta etapa é somente este documento; não são especificadas alterações ou tarefas vinculadas a arquivos de backend ou frontend.

1. **Validar requisitos e decisões:** confirmar o identificador de usuário, limite de upload, comportamento de erros e restrições operacionais antes da implementação.
2. **Estabelecer o fluxo do backend:** organizar responsabilidades na ordem routes, controllers, services e repositories, preservando o endpoint de saúde e mantendo as dependências unidirecionais.
3. **Implementar upload local:** receber multipart com Multer `diskStorage`, aplicar limite, gravar com nome seguro e registrar metadados em memória; tratar falhas e limpeza do arquivo recém-gravado.
4. **Implementar consulta e download:** listar por proprietário e permitir download por ID com verificação de existência e propriedade, sem revelar caminhos locais.
5. **Integrar a experiência web:** conectar upload, listagem e download à API via `fetch` e proxy `/api`, cobrindo estados de carregamento, sucesso, vazio e erro.
6. **Validar o comportamento ponta a ponta:** testar contratos HTTP, isolamento entre proprietários, limite de tamanho, nomes de download, falhas de filesystem e build da interface; revisar também as limitações de reinício e autenticação.

## 9. Critérios de aceite

- A especificação cobre upload, listagem e download com contratos verificáveis.
- Os arquivos são armazenados apenas no filesystem local via Multer `diskStorage`; metadados ficam em memória.
- Os requisitos de propriedade são refletidos na listagem e no download, com a limitação de autenticação documentada.
- O plano respeita as quatro camadas do backend e não inclui alterações a arquivos de implementação nesta entrega.
- O único arquivo criado por esta solicitação é `docs/specs/dms-spec.md`.