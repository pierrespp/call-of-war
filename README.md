<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Call of War — Simulador Tático VTT

Simulador de combate tático em grid com sistema de cobertura, movimentação realista e **Gerador de Mapas com IA**.

## 🎮 Funcionalidades

- **Sistema de Combate Tático:** Grid 40×40, sistema de cobertura (meia/total/parede), movimentação com custo por terreno
- **Multiplayer em Tempo Real:** Salas com código de 6 dígitos, turnos alternados, sincronização via polling
- **Editor de Mapas:** Crie e edite mapas personalizados com ferramentas de pintura
- **🆕 Gerador de Mapas com IA:** Gere mapas táticos realistas usando Google Gemini Vision API

## 🤖 Gerador de Mapas com IA

### Como Usar

1. **Acesse o Gerador:**
   - No menu principal, clique em "Gerador de Mapa"

2. **Desenhe a Legenda:**
   - Selecione o tamanho do grid (30×30, 40×40 ou 50×50)
   - Use os pincéis para pintar a legenda:
     - **Vazio:** Apaga marcação
     - **Meia Cobertura:** Paredes baixas, carros (-20% de hit)
     - **Cobertura Total:** Prédios, containers (-40% de hit)
     - **Parede:** Bloqueia tiros e movimento
     - **Deploy A/B:** Zonas de deploy das equipes
     - **Água:** Rios, lagos (terreno lento)
   - Clique e arraste para pintar várias células

3. **Adicione um Tema (Opcional):**
   - Digite uma descrição temática, ex: "cidade urbana destruída, prédios em ruínas"
   - O tema ajuda a IA a gerar elementos visuais coerentes

4. **Gere o Mapa:**
   - Clique em "Gerar Mapa"
   - Aguarde até 30 segundos enquanto a IA:
     - Interpreta a legenda pintada
     - Gera uma imagem realista de vista superior
     - Detecta automaticamente as coberturas na imagem gerada

5. **Revise e Salve:**
   - Visualize a imagem gerada
   - Use o toggle "Mostrar/Ocultar coberturas" para verificar a detecção
   - Clique em "Gerar Novamente" se não gostar do resultado
   - Clique em "Salvar Mapa" e dê um nome
   - O mapa estará disponível no seletor ao criar partidas

### Limitações

- **Rate Limit:** Máximo de 8 gerações por minuto (cota gratuita do Gemini)
- **Qualidade:** A IA pode não respeitar 100% a legenda — sempre revise antes de salvar
- **Detecção:** As coberturas detectadas são estimativas — edite no Editor de Mapas se necessário

### Dicas para Boas Legendas

✅ **Faça:**
- Use áreas contíguas e bem definidas
- Mantenha proporções realistas (paredes não muito finas, deploy zones com pelo menos 9 células)
- Combine tipos de cobertura para criar variedade
- Use temas específicos: "deserto com dunas", "floresta densa", "base industrial"

❌ **Evite:**
- Legendas muito complexas ou detalhadas (a IA pode simplificar)
- Áreas muito pequenas (1-2 células) — podem ser ignoradas
- Temas vagos ou contraditórios

### Exemplos de Temas Eficazes

- **Urbano:** "cidade destruída, prédios em ruínas, ruas com escombros"
- **Deserto:** "deserto árido com dunas de areia e rochas"
- **Floresta:** "floresta densa com árvores altas e vegetação rasteira"
- **Industrial:** "complexo industrial com containers e maquinário pesado"
- **Militar:** "base militar com bunkers e fortificações de concreto"

## 🚀 Executar Localmente

### Pré-requisitos

- Node.js (v18+)
- Conta Google Cloud com Gemini API habilitada

### Instalação

1. **Clone o repositório:**
   ```bash
   git clone <repo-url>
   cd "Call Of War/4.0"
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente:**
   - Copie `.env.example` para `.env`
   - Adicione sua chave do Gemini:
     ```
     GEMINI_API_KEY=sua_chave_aqui
     ```
   - Obtenha a chave em: https://aistudio.google.com/app/apikey
   - Configure as variáveis do Firebase (Storage, Database)

4. **Inicie o servidor:**
   ```bash
   npm start
   ```

5. **Acesse no navegador:**
   ```
   http://localhost:5000
   ```

## 📁 Estrutura do Projeto

```
.
├── src/
│   ├── components/
│   │   ├── AIMapCreatorMenu.tsx      # Gerador de mapas com IA
│   │   ├── MapEditorMenu.tsx         # Editor manual de mapas
│   │   ├── CreateMatchMenu.tsx       # Montagem de exército
│   │   └── ...
│   ├── services/
│   │   ├── aiMapService.ts           # Cliente HTTP para API de mapas IA
│   │   └── apiService.ts             # Cliente HTTP geral
│   ├── data/
│   │   ├── geminiPrompts.ts          # Templates de prompt otimizados
│   │   └── constants.ts              # Constantes do jogo
│   └── types/
│       └── game.ts                   # Tipos TypeScript
├── geminiService.ts                  # Integração com Gemini API (servidor)
├── geminiRateLimiter.ts              # Rate limiting (8 req/min)
├── server.ts                         # Servidor Express
└── data/
    └── ai-maps.json                  # Metadados dos mapas gerados
```

## 🛠️ Tecnologias

- **Frontend:** React, TypeScript, Tailwind CSS, Lucide Icons
- **Backend:** Node.js, Express, PostgreSQL
- **IA:** Google Gemini 2.5 Flash Image (geração), Gemini 2.5 Flash (detecção)
- **Storage:** Firebase Storage (imagens dos mapas)
- **Deploy:** Vercel (frontend + backend)

## 📝 Scripts Disponíveis

- `npm start` — Inicia o servidor de desenvolvimento
- `npm run build` — Build de produção
- `npm run lint` — Verifica erros de TypeScript
- `npm run deploy:vercel` — Deploy para Vercel

## 🔧 Configuração Avançada

### Rate Limiting

O rate limiter está configurado para 8 requisições por minuto (margem de segurança abaixo do limite gratuito de 10 req/min do Gemini). Para ajustar:

```typescript
// geminiRateLimiter.ts
const RATE_LIMIT_MAX = 8;  // Altere aqui
```

### Prompt Engineering

Os prompts estão em `src/data/geminiPrompts.ts`. Você pode ajustar:
- Especificações técnicas
- Mapeamento de cores da legenda
- Exemplos de elementos por tema
- Regras de classificação de coberturas

## 🐛 Troubleshooting

### "GEMINI_API_KEY não configurada no servidor"
- Verifique que a chave está em `.env` ou nos Replit Secrets
- Reinicie o servidor após adicionar a chave

### "Limite de requisições atingido"
- Aguarde 60 segundos para o reset do contador
- O limite é compartilhado por todos os usuários do servidor

### Imagem gerada não respeita a legenda
- Simplifique a legenda (menos detalhes)
- Use áreas maiores e mais contíguas
- Tente um tema mais específico
- Gere novamente (a IA tem variação natural)

### Coberturas detectadas incorretas
- Edite manualmente no Editor de Mapas
- A detecção é uma estimativa baseada em visão computacional

## 📄 Licença

Este projeto é de código aberto. Consulte o arquivo LICENSE para mais detalhes.

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:
1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

## 📞 Suporte

Para dúvidas ou problemas:
- Abra uma issue no GitHub
- Consulte a documentação em `ARQUITETURA.md`
- Veja o plano de implementação em `progresso.md`
