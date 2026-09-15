# Author Contributor Editor — OJS plugin

[![OJS](https://img.shields.io/badge/OJS-3.5-brightgreen)](https://pkp.sfu.ca/ojs/)
[![Version](https://img.shields.io/badge/version-1.0.0.2-blue)](version.xml)
[![License](https://img.shields.io/badge/license-GPL--3.0-lightgrey)](LICENSE)

**⬇️ Install package:** [OJS 3.5](https://github.com/OJSBR/authorContributorEditor/releases/download/1.0.0.2/authorContributorEditor-1.0.0.2.tar.gz) — or browse all [Releases](../../releases).

A generic plugin for **Open Journal Systems (OJS)** that gives authors back the ability to
**edit the contributor list of their own submissions** — as in OJS 3.3 and 3.4 — whenever the
journal has granted their user group *"Allow to edit submission metadata"*, **without patching
OJS core**.

> **Developed and maintained by [OJSBR](https://ojsbr.com).** See the
> [Credits & authorship](#credits--authorship) section below.

## Compatibility & branches

| OJS version | Branch | Plugin release |
|-------------|--------|----------------|
| OJS 3.5.x   | [`stable-3_5_0`](../../tree/stable-3_5_0) *(default)* | 1.0.0.2 |

## The problem

Under **Users & Roles → Roles**, the *Author* user group has an option named **Allow to edit
submission metadata**. In OJS 3.3 and 3.4, when it was checked, the author could edit both the
article metadata **and** the authorship — add, edit, remove and reorder contributors, and set
the primary contact.

In OJS 3.5 the author still edits every other metadata field, but the **Contributors** panel
shows up with no action buttons at all. Always read-only.

## The cause

It is not a permission rule. It is a property that went missing.

The panel is built by the `workflow` store (Vue/Pinia). The **editorial** workflow configuration
builds the item like this:

```js
{component: 'ContributorManager',
 props: {submission, publication, canEdit: permissions.canEditPublication}}
```

while the **author** workflow configuration builds the very same item **without the `canEdit`
property**:

```js
{component: 'ContributorManager', props: {submission, publication}}
```

With `canEdit` undefined, `ContributorsListPanel` receives `canEditPublication = false` and hides
the add, edit, delete, reorder and primary-contact actions — that flag is the panel's only gate.

Meanwhile the REST API keeps authorising the operation normally: the contributor routes go
through `PublicationWritePolicy` → `Repo::submission()->canEditPublication()`, which reads the
`canChangeMetadata` flag of the user's stage assignment. The server allows it; the interface just
never offers it.

## What it does

It registers an official store extension (`pkp.registry.storeExtendFn`) that wraps
`getPrimaryItems` and puts the missing property back, using the very same permission core has
already computed for the page:

```js
item.props.canEdit = permissions.canEditPublication;
```

The value is only filled in **when the property is absent**, so the editorial workflow — which
already sets it — is never touched. No core file is patched and no permission check is bypassed:

- if the author's user group does **not** have *Allow to edit submission metadata*,
  `canEditPublication` stays false and nothing changes;
- once a publication is published or scheduled, core already forces `canEditPublication = false`
  for authors, and the plugin honours that;
- the server keeps validating every API call.

## Installation

1. Download the release (or clone the branch).
2. Install via **Settings → Website → Plugins → Upload A New Plugin**, or extract the folder
   into `plugins/generic/` so you get `plugins/generic/authorContributorEditor/`.
3. Enable **Author Contributor Editor** under the *Generic* plugins list.

There is nothing to configure. Make sure the *Author* user group has **Allow to edit submission
metadata** checked under **Users & Roles → Roles** — that is the setting the plugin defers to.

## The ORCID field

This plugin only restores the panel's permission. If the **ORCID** field shows up read-only in
the contributor form, the cause is a different one: OJS core renders the OAuth widget
(`FieldOrcid`, not typeable) whenever ORCID is enabled for the context, and the
[`orcidManualEntry`](https://github.com/OJSBR/orcidManualEntry) plugin — which restores the
typeable field — deliberately stays inert in that case. Disabling ORCID under **Settings →
Distribution → ORCID** brings the typeable field back.

## How it works (technical)

- The script is published from a `TemplateManager::display` hook filtered on
  `dashboard/editors.tpl`. Every OJS 3.5 workflow view goes through that template: the handlers
  in `pages/workflow` only redirect to the dashboard.
- It is registered with `STYLE_SEQUENCE_LAST` so it loads **after** `js/build.js` (which core
  registers with `STYLE_SEQUENCE_LATE`) and **before** the inline `pkp.registry.init()` call at
  the end of the page — the window in which the Pinia extension must be registered, since the
  workflow store is created at mount time.
- No core file is patched and nothing is stored by the plugin.

## Languages

Plugin name and description in the **38 languages** of the PKP standard set (reviewed in
English, Portuguese, Spanish, Catalan, Galician, French, Italian, German and Dutch; the others are
marked for review).

## A note on upgrades

The behaviour this plugin corrects lives in the workflow configuration compiled into
`js/build.js`, so it is worth re-checking on every new OJS release. If PKP fixes it in core, the
plugin becomes a no-op on its own — it never overwrites a `canEdit` that is already set — and can
simply be disabled.

## Tests

- **PHPUnit** (`tests/*Test.php`, on `PKP\tests\PKPTestCase`): the class against the installed
  PKP, the plugin found by PKP's plugin registry, the script added to the dashboard only, after
  the core build and before the registry starts, the store extension filling in only a missing
  flag, and the translations. From the OJS root:

  ```bash
  lib/pkp/lib/vendor/bin/phpunit --configuration lib/pkp/tests/phpunit.xml --no-coverage "$PWD/plugins/generic/authorContributorEditor/tests"
  ```

- **Cypress** (`cypress/tests/functional/AuthorContributorEditor.cy.js`, run by
  [pkp-github-actions](https://github.com/pkp/pkp-github-actions) on every push): enables the
  plugin and checks the script is loaded once on the dashboard. Given an author account and two
  of its submissions (`authorUser`, `authorPassword`, `editableSubmissionId`,
  `lockedSubmissionId`), it also checks the author gets the contributor actions only where the
  assignment allows metadata changes; it fails without the script, and when the script ignores
  the permission.
- Verified on OJS 3.5.0.3 with a temporary author and two submissions, removed after the run.

Tests are kept in the repository and are not part of the release package.

## Credits & authorship

- **Developed and maintained by** [OJSBR](https://ojsbr.com) — original plugin.
- Distributed under the **GNU GPL v3**.

## AI use

Generative AI (Claude, by Anthropic) was used to write and run tests, improve the code and bring
it in line with PKP standards. Every change is reviewed and tested by OJSBR, which is responsible
for the published releases.

## Contributing

Issues and pull requests are welcome. Please target the branch matching the OJS version you
are working against. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Distributed under the **GNU GPL v3**. See [`LICENSE`](LICENSE) and `docs/COPYING`.

---

## 🇧🇷 Português

Plugin genérico para o **Open Journal Systems (OJS)** que devolve ao autor a **edição da lista de
autores e colaboradores da própria submissão** — como no OJS 3.3 e 3.4 — sempre que a revista
tiver concedido ao grupo de usuários dele a opção *"Permitir editar metadados da submissão"*,
**sem alterar o núcleo do OJS**.

> **Desenvolvido e mantido pela [OJSBR](https://ojsbr.com).** Veja a seção
> [Créditos e autoria](#créditos-e-autoria) abaixo.

### Compatibilidade e branches

| Versão do OJS | Branch | Release do plugin |
|---------------|--------|-------------------|
| OJS 3.5.x     | `stable-3_5_0` *(padrão)* | 1.0.0.0 |

### O problema

Em **Usuários e Papéis → Papéis**, o grupo de usuários *Autor* tem a opção **Permitir editar
metadados da submissão**. No OJS 3.3 e 3.4, quando ela estava marcada, o autor editava tanto os
metadados do artigo quanto a autoria — incluir, editar, remover e reordenar autores, e definir o
contato principal.

No OJS 3.5 o autor continua editando todos os demais metadados, mas o painel **Colaboradores**
aparece sem nenhum botão de ação. Sempre somente leitura.

### A causa

Não é uma regra de permissão. É uma propriedade que faltou.

O painel é montado pelo store `workflow` (Vue/Pinia). A configuração do fluxo de trabalho
**editorial** monta o item assim:

```js
{component: 'ContributorManager',
 props: {submission, publication, canEdit: permissions.canEditPublication}}
```

enquanto a configuração do fluxo de trabalho **do autor** monta o mesmo item **sem a propriedade
`canEdit`**:

```js
{component: 'ContributorManager', props: {submission, publication}}
```

Com `canEdit` indefinido, o `ContributorsListPanel` recebe `canEditPublication = false` e esconde
as ações de incluir, editar, excluir, reordenar e definir contato principal — essa flag é o único
gate do painel.

Enquanto isso, a API REST continua autorizando normalmente: as rotas de colaborador passam por
`PublicationWritePolicy` → `Repo::submission()->canEditPublication()`, que lê o `canChangeMetadata`
da atribuição de estágio do usuário. O servidor permite; a interface é que não oferece.

### O que faz

Registra uma extensão oficial do store (`pkp.registry.storeExtendFn`) que embrulha
`getPrimaryItems` e repõe a propriedade que faltou, usando a mesma permissão que o núcleo já
calculou para a página:

```js
item.props.canEdit = permissions.canEditPublication;
```

O valor só é preenchido **quando a propriedade está ausente**, então o fluxo editorial — que já a
define — nunca é tocado. Nenhum arquivo do núcleo é alterado e nenhuma verificação de permissão é
afastada:

- se o grupo de usuários do autor **não** tiver *Permitir editar metadados da submissão*,
  `canEditPublication` continua falso e nada muda;
- havendo publicação publicada ou agendada, o núcleo já força `canEditPublication = false` para
  autores, e o plugin respeita isso;
- o servidor continua validando cada chamada da API.

### Instalação

Instale em **Configurações → Website → Plugins → Enviar um novo plugin**, ou extraia a pasta em
`plugins/generic/` (ficando `plugins/generic/authorContributorEditor/`). Depois ative a **Edição
de Autoria pelo Autor** na lista de plugins *Genéricos*. Não há nada para configurar.

Confira se o grupo de usuários *Autor* está com **Permitir editar metadados da submissão** marcado
em **Usuários e Papéis → Papéis** — é essa configuração que o plugin respeita.

### O campo ORCID

Este plugin trata apenas da permissão do painel. Se o campo **ORCID** aparecer somente leitura no
formulário de colaborador, a causa é outra: o núcleo do OJS mostra o widget de OAuth
(`FieldOrcid`, não digitável) sempre que o ORCID estiver habilitado no contexto, e o plugin
[`orcidManualEntry`](https://github.com/OJSBR/orcidManualEntry) — que repõe o campo digitável —
fica inerte de propósito nesse caso. Desabilitar o ORCID em **Configurações → Distribuição →
ORCID** devolve o campo digitável.

### Como funciona (técnico)

- O script é publicado por um hook `TemplateManager::display` filtrado em
  `dashboard/editors.tpl`. Toda view de fluxo de trabalho do OJS 3.5 passa por esse template: os
  handlers de `pages/workflow` apenas redirecionam para o dashboard.
- Ele é registrado com `STYLE_SEQUENCE_LAST` para carregar **depois** do `js/build.js` (que o
  núcleo registra com `STYLE_SEQUENCE_LATE`) e **antes** da chamada inline de
  `pkp.registry.init()` no fim da página — a janela em que a extensão do Pinia precisa ser
  registrada, já que o store `workflow` nasce junto com o mount.
- Nenhum arquivo do núcleo é alterado e o plugin não grava nada.

### Idiomas

Nome e descrição do plugin nos **38 idiomas** do conjunto padrão da PKP (revisados em inglês,
português, espanhol, catalão, galego, francês, italiano, alemão e holandês; os demais ficam marcados
para revisão).

### Sobre atualizações

O comportamento que este plugin corrige está na configuração do fluxo de trabalho compilada em
`js/build.js`, então vale reconferir a cada versão nova do OJS. Se a PKP corrigir no núcleo, o
plugin vira inócuo sozinho — ele nunca sobrescreve um `canEdit` já definido — e pode simplesmente
ser desativado.

### Testes

PHPUnit em `tests/` (sobre `PKP\tests\PKPTestCase`) e Cypress em `cypress/tests/functional/`
(rodado pelo [pkp-github-actions](https://github.com/pkp/pkp-github-actions) a cada push), com o
comando da seção em inglês. A suíte cobre a classe contra o PKP instalado, o plugin encontrado pelo
registro de plugins, o script só no painel, depois do build do núcleo e antes de o registro
iniciar, a extensão do store preenchendo só a flag ausente, e as traduções. O Cypress liga o plugin
e confere o script carregado uma vez no painel; com uma conta de autor e duas submissões dela
(`authorUser`, `authorPassword`, `editableSubmissionId`, `lockedSubmissionId`), confere que o autor
só ganha as ações de contribuidores onde a designação permite alterar metadados (falha sem o script
e quando o script ignora a permissão). Verificado no OJS 3.5.0.3 com um autor e duas submissões
temporários, removidos depois da rodada.

Os testes ficam no repositório e não fazem parte do pacote da release.

### Créditos e autoria

- **Desenvolvido e mantido pela** [OJSBR](https://ojsbr.com) — plugin autoral.
- Distribuído sob a **GNU GPL v3**.

### Uso de IA

Foi usada IA generativa (Claude, da Anthropic) para escrever e rodar testes, melhorar o código e
alinhá-lo aos padrões da PKP. Toda mudança é revisada e testada pela OJSBR, que responde pelas
releases publicadas.

### Licença

Distribuído sob a **GNU GPL v3**. Veja [`LICENSE`](LICENSE) e `docs/COPYING`.
