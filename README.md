<div align="center">
  <img src="./favicon.svg" alt="Ícone do Placa" width="64" height="64">
  <h1>Placa</h1>
  <p><strong>Suas vendas, compras e lucro em um só lugar.</strong></p>
  <p>Um controle simples para quem vende plaquinhas de avaliação do Google com NFC.</p>
  <p>
    <a href="#funcionalidades">Funcionalidades</a> ·
    <a href="#executar-localmente">Como executar</a> ·
    <a href="#publicar-no-github-pages">Publicar</a> ·
    <a href="#armazenamento-e-privacidade">Dados e backup</a>
  </p>
</div>

---

O **Placa** foi criado para registrar vendas presenciais com rapidez e acompanhar o resultado do negócio. A interface está em português do Brasil, usa valores em reais e reúne os números do mês em um painel de leitura fácil.

Feito com **HTML, CSS e JavaScript puros**, funciona inteiramente no navegador, sem login, backend ou etapa de build. Pode ser usado no computador ou publicado no GitHub Pages, inclusive no subdiretório de um repositório.

## Funcionalidades

| Área | O que você pode fazer |
| --- | --- |
| **Vendas** | Cadastrar cliente/loja, quantidade, valor total negociado, pagamento e data. Editar, excluir com confirmação e marcar como paga. |
| **Visão geral** | Consultar total vendido, valor recebido, valor pendente e quantidade de plaquinhas vendidas. |
| **Gráfico** | Acompanhar o valor vendido por dia e consultar o total de cada barra. |
| **Compras** | Registrar quantidade comprada e custo por unidade, com cálculo automático do total. Editar e excluir compras. |
| **Lucro** | Ver custo médio por placa, custo das placas vendidas e lucro estimado do mês. |
| **Filtro mensal** | Navegar entre meses para consultar vendas, compras e seus resumos. |
| **Backup** | Exportar e importar todas as vendas e compras em JSON, com validação e confirmação antes de substituir os dados. |

A data começa no dia atual e pode ser alterada. Os dados são salvos assim que você confirma o formulário, e o painel é atualizado imediatamente.

## Executar localmente

Clone o repositório e entre na pasta:

```sh
git clone https://github.com/joaonavari/Vendas_Pr.git
cd Vendas_Pr
```

Você pode abrir `index.html` diretamente em um navegador atualizado (Chrome, Edge, Safari ou Firefox). Para usar um endereço local estável, com Python 3 instalado, execute:

```sh
python3 -m http.server 8000
```

Acesse **http://localhost:8000**. Para encerrar, pressione `Ctrl+C` no terminal. Esse servidor serve apenas os arquivos estáticos para testes; o site publicado não precisa de backend.

## Publicar no GitHub Pages

Com os arquivos na branch `main`:

1. No repositório, entre em **Settings → Pages**.
2. Em **Build and deployment → Source**, selecione **Deploy from a branch**.
3. Selecione a branch **main** e a pasta **/ (root)** e clique em **Save**.
4. Aguarde a publicação. O endereço aparecerá nessa tela.

O site deste repositório está em **https://joaonavari.github.io/Vendas_Pr/**. Se você fizer um fork, ative o GitHub Pages e use seu nome de usuário e o nome do seu repositório no endereço.

Os caminhos dos arquivos são relativos (`./`), portanto funcionam também no subdiretório de um repositório. O arquivo `.nojekyll` desativa o processamento pelo Jekyll. Basta atualizar os arquivos na branch escolhida para publicar novas versões.

Referências: [Configurar a origem de publicação](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) e [criar um site GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## Como usar

- **Cadastrar venda:** informe cliente/loja, quantidade, valor total negociado, pagamento e data. A data começa no dia atual do computador. O valor é o total da venda, nunca o preço unitário. Aceita `250,00`, `250.00` e `1.250,00`.
- **Filtrar:** o seletor de mês e as setas filtram vendas, compras, totais e gráfico pelas respectivas datas. O valor recebido representa vendas desse mês marcadas como pagas, independentemente do dia em que o pagamento foi recebido. O custo médio considera as compras de todos os meses até o fim do mês selecionado.
- **Retomar:** o mês selecionado é lembrado ao atualizar ou abrir o site novamente. Na primeira abertura sem essa preferência, o painel mostra o mês atual se houver registros nele; caso contrário, o último mês com registros. Se você selecionar um mês vazio, um aviso permite voltar ao último mês com registros.
- **Salvar:** a lista, os totais e o gráfico são atualizados imediatamente. Se a venda tiver data em outro mês, o painel muda para esse mês e avisa.
- **Editar:** use o lápis na linha. Também é possível voltar um pagamento para pendente pelo formulário.
- **Receber:** use **Marcar como paga** nas vendas pendentes.
- **Excluir:** use a lixeira e confirme no diálogo.
- **Gráfico:** cada barra representa o total vendido naquele dia, incluindo vendas pagas e pendentes. Passe o mouse ou use Tab nas barras com vendas para ler o valor exato. A escala lateral está em reais.
- **Compras:** em **Compras de plaquinhas → Cadastrar compra**, informe quantidade comprada, custo por unidade e data. O total da compra é calculado automaticamente. Use o lápis para editar ou a lixeira para excluir com confirmação. A lista, a quantidade comprada e o total gasto mostram apenas o mês selecionado.
- **Lucro:** os novos resumos mostram lucro estimado do mês, custo das placas vendidas e custo médio por placa. Cadastre também as compras anteriores para incluir o custo de produtos já vendidos.
- **Backup:** **Exportar backup** baixa um JSON com todas as vendas e compras, de todos os meses. **Importar JSON** valida o arquivo e pede confirmação antes de substituir todos os registros. Cancelar ou importar um arquivo inválido não altera os dados. Backups antigos (versão 1) continuam aceitos; como não possuem compras, a confirmação avisa que as compras atuais serão removidas.

## Como o lucro é estimado

O custo médio ponderado é **a soma de quantidade × custo unitário de cada compra, dividida pela quantidade total comprada**. São consideradas todas as compras com data até o último dia do mês selecionado; compras de meses futuros não afetam os meses anteriores.

O custo das placas vendidas é **quantidade vendida no mês × custo médio**, arredondado em centavos apenas no total. O lucro estimado é **total vendido no mês − custo das placas vendidas**. O cálculo inclui vendas pagas e pendentes e considera apenas o custo das plaquinhas, sem outros gastos.

Por exemplo: 10 placas compradas a R$ 20,00 e outras 10 a R$ 30,00 resultam em custo médio de R$ 25,00. Se você vender 4 por um total de R$ 300,00, o custo será R$ 100,00 e o lucro estimado R$ 200,00. O valor investido em placas ainda não vendidas não é descontado inteiro do lucro daquele mês.

Essa é uma estimativa pela média acumulada das compras, sem vincular lotes específicos a cada venda. Registrar, editar ou excluir uma compra recalcula as estimativas do mês da compra em diante. O custo médio exibido é arredondado para duas casas, mas o cálculo usa a média completa. Um resultado negativo aparece em vermelho. Se houver vendas sem nenhuma compra anterior ou no mesmo mês, custo e lucro aparecem como `—` até você cadastrar a compra. Quando a quantidade vendida acumulada supera a comprada, aparece um aviso para conferir compras faltantes.

## Armazenamento e privacidade

Vendas e compras são salvas em `localStorage`, na chave `placa.vendas.v1`, somente no navegador e perfil usados. A chave original foi mantida para preservar as vendas de versões anteriores. O formato é atualizado para a versão 2 na próxima gravação, sem descartar vendas. Fechar e abrir o site mantém os registros. Nenhum dado de venda ou compra é enviado ao GitHub ou a outros serviços; não há analytics, fontes remotas ou bibliotecas externas.

Faça backup regularmente. Limpar os dados do navegador, usar uma janela privada, trocar de perfil, computador ou endereço não transfere os registros. Ao passar do endereço local para o GitHub Pages, exporte no local e importe no site publicado. O armazenamento de arquivos abertos por `file://` depende do navegador; prefira o endereço publicado para uso diário.

O `localStorage` é compartilhado por origem (protocolo, domínio e porta), não por subdiretório. Cópias deste aplicativo no mesmo domínio compartilham a chave. Abas abertas no mesmo endereço acompanham alterações; formulários abertos são fechados quando outra aba altera os registros, para evitar sobrescrever alterações.

Se a leitura falhar, os dados originais são preservados e novas vendas ficam bloqueadas. É possível exportar o conteúdo original para recuperação ou importar um backup válido. Se a gravação falhar por bloqueio ou falta de espaço, a alteração não é aplicada e a interface mostra um aviso.

<details>
<summary><strong>Formato do backup e limites de importação</strong></summary>

```json
{
  "app": "placa",
  "version": 2,
  "exportedAt": "2026-10-01T12:00:00.000Z",
  "sales": [
    {
      "id": "identificador-unico",
      "customer": "Café da Esquina",
      "quantity": 2,
      "amountCents": 25000,
      "payment": "paid",
      "date": "2026-10-01"
    }
  ],
  "purchases": [
    {
      "id": "identificador-unico-da-compra",
      "quantity": 10,
      "unitCostCents": 2500,
      "date": "2026-09-20"
    }
  ]
}
```

`amountCents` é o total da venda em centavos (`25000` = R$ 250,00). `unitCostCents` é o custo de uma placa (`2500` = R$ 25,00). `payment` aceita `paid` ou `pending`. Datas usam `AAAA-MM-DD`. O importador verifica versão, campos, datas, valores e IDs duplicados antes da confirmação. A versão 1, com apenas `sales`, permanece compatível. Limites: arquivo de 20 MB, 100.000 vendas e 100.000 compras, 1.000.000 de unidades por registro e R$ 9.999.999,99 no total de cada venda ou compra.

</details>

## Estrutura do projeto

```text
Vendas_Pr/
├── index.html          # Interface e formulários
├── styles.css          # Estilos e layout responsivo
├── app.js              # Cadastros, cálculos, armazenamento e backup
├── favicon.svg         # Ícone do aplicativo
├── .nojekyll           # Configuração para o GitHub Pages
└── tests/browser.cjs   # Testes de integração no navegador
```

## Testes

Não é necessário instalar pacotes nem compilar. Verificação de sintaxe (Node.js opcional):

```sh
node --check app.js
```

A suíte opcional `tests/browser.cjs` verifica os fluxos principais em um perfil temporário, sem tocar nos dados do seu navegador. Requer Node.js, Google Chrome instalado e Playwright disponível:

A suíte cobre vendas, compras, filtros mensais, persistência, cálculo de lucro, migração de dados antigos, backups, validações e layout responsivo.

```sh
npm install --no-save --package-lock=false playwright
# Com o servidor local em execução em outro terminal:
node tests/browser.cjs
```

Para testar outro endereço, use `BASE_URL=http://localhost:8000/seu-subdiretorio/ node tests/browser.cjs`. Playwright é usado somente nos testes, não pelo site. As capturas de tela são gravadas na pasta temporária indicada ao final da execução.

Para uma conferência manual, cadastre vendas pagas e pendentes em dois meses, edite quantidade e valor, marque uma como paga e confira os resumos e barras. Cadastre compras em meses diferentes e confira a média ponderada, o custo e o lucro. Compras futuras não devem afetar o lucro de meses anteriores. Recarregue para conferir a persistência. Exporte um backup, cancele uma importação e uma exclusão, depois confirme a importação e verifique a restauração de vendas e compras. Um JSON inválido deve ser recusado sem alterar os registros.
