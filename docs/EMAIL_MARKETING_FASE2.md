# Editor de E-mail Marketing - FASE 2

## Visão Geral

Editor visual baseado em blocos para criação de campanhas e templates de e-mail marketing profissionais.

## Características Principais

### ✅ **Editor Visual Completo**
- Interface drag-and-drop visual
- 15 tipos de blocos diferentes
- Painel de propriedades em tempo real
- Preview desktop e mobile
- Visualização de código HTML

### ✅ **Blocos Disponíveis**

#### Estrutura
- **Header/Logo**: Cabeçalho com logo configurável
- **Heading**: Títulos H1, H2, H3
- **Text**: Parágrafos de texto
- **Divider**: Linhas divisórias
- **Spacer**: Espaçadores verticais
- **Footer**: Rodapé customizável

#### Conteúdo
- **Image**: Imagens com links opcionais
- **Button**: Botões call-to-action
- **Banner**: Banners full-width
- **Product**: Cards de produtos com imagem, preço e CTA

#### Layout
- **2 Columns**: Layout de duas colunas
- **3 Columns**: Layout de três colunas

#### Social & Legal
- **Social**: Ícones de redes sociais
- **Legal**: Texto legal/compliance
- **Unsubscribe**: Link de descadastro

### ✅ **Propriedades Editáveis**

Cada bloco permite configurar:
- Texto e conteúdo
- Cores (fundo, texto, botões)
- Alinhamento (esquerda, centro, direita)
- Espaçamento (padding, margin)
- URLs e links
- Tamanhos (largura, altura, fontes)
- Border radius
- E mais propriedades específicas por bloco

### ✅ **Geração de HTML**

O editor gera HTML otimizado para e-mail:
- Baseado em tables (máxima compatibilidade)
- Responsivo com media queries
- CSS inline
- Suporte a clientes de e-mail antigos
- Fallbacks para imagens

### ✅ **Persistência**

Salva automaticamente:
- `content_json`: Estrutura JSON dos blocos editável
- `content_html`: HTML final renderizado pronto para envio

### ✅ **Integração com Templates**

- Ao selecionar um template, o conteúdo é carregado automaticamente
- Templates podem ser criados e editados com o mesmo editor
- Campanhas herdam o design do template selecionado

## Como Usar

### Criar Nova Campanha com Editor

1. Acesse **E-mail Marketing**
2. Clique em **Nova Campanha**
3. Preencha os detalhes na aba **Detalhes**
4. Vá para a aba **Conteúdo**
5. Adicione blocos clicando nos botões da barra lateral
6. Clique em um bloco para editá-lo no painel de propriedades
7. Use os botões de ação para:
   - ↑↓ Reordenar blocos
   - 📋 Duplicar bloco
   - 🗑️ Remover bloco
8. Alterne entre **Editor**, **Preview** e **HTML**
9. Teste responsividade com **Desktop** e **Mobile**
10. Salve a campanha

### Criar Template

1. Acesse **E-mail Marketing** → aba **Templates**
2. Clique em **Novo Template**
3. Configure nome, descrição e tipo na aba **Detalhes**
4. Vá para **Design** e construa o template
5. Salve o template

### Usar Template em Campanha

1. Ao criar campanha, selecione um template no campo **Template**
2. O conteúdo do template será carregado automaticamente no editor
3. Edite conforme necessário
4. Salve a campanha

## Estrutura Técnica

### Componentes Principais

```
src/components/email-marketing/editor/
├── types.ts                    # TypeScript types para blocos
├── blockTemplates.ts           # Templates padrão dos blocos
├── htmlGenerator.ts            # Gerador de HTML responsivo
├── BlockRenderer.tsx           # Renderizador visual de blocos
├── BlockPropertiesPanel.tsx   # Painel de edição de propriedades
└── EmailEditor.tsx             # Componente principal do editor
```

### Fluxo de Dados

1. **Estado**: `EmailContent` contém array de `EmailBlock[]`
2. **Edição**: Usuário adiciona/edita blocos via UI
3. **Persistência**: `onChange` callback retorna `content_json` e `content_html`
4. **Salvamento**: Dados são salvos nas tabelas `email_campaigns` ou `email_templates`

### Formato do JSON

```json
{
  "blocks": [
    {
      "type": "heading",
      "text": "Título",
      "level": "h1",
      "color": "#333",
      "padding": "20px"
    },
    {
      "type": "button",
      "text": "Clique Aqui",
      "url": "https://...",
      "buttonColor": "#0066cc"
    }
  ],
  "globalStyles": {
    "bodyBackground": "#f4f4f4",
    "contentWidth": "600px",
    "fontFamily": "Arial, sans-serif"
  }
}
```

## Responsividade

O HTML gerado inclui:
- Media query `@media (max-width: 600px)`
- Classes especiais: `.mobile-padding`, `.mobile-hide`, `.mobile-column`
- Colunas empilham automaticamente em mobile
- Imagens redimensionam proporcionalmente

## Próximos Passos (FASE 3)

- [ ] Integração com envio real via AWS SES
- [ ] Editor de texto rico inline
- [ ] Upload de imagens
- [ ] Biblioteca de imagens
- [ ] Variáveis dinâmicas ({{nome}}, {{produto}}, etc.)
- [ ] Pré-visualização com dados reais
- [ ] Testes A/B
- [ ] Tracking de aberturas e cliques
