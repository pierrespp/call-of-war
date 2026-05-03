<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Call of War — Simulador Tático VTT

Simulador de combate tático em grid com sistema de cobertura, movimentação realista e **Gerador de Mapas com IA**.

## 🎮 Funcionalidades

- **Sistema de Combate Tático:** Grid 40×40, sistema de cobertura (meia/total/parede), movimentação com custo por terreno
- **Multiplayer em Tempo Real:** Salas com código de 6 dígitos, turnos alternados, sincronização via polling
- **Editor de Mapas:** Crie e edite mapas personalizados com ferramentas de pintura

## 🚀 Executar Localmente

### Pré-requisitos

- Node.js (v18+)

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
│   │   ├── MapEditorMenu.tsx         # Editor manual de mapas
│   │   ├── CreateMatchMenu.tsx       # Montagem de exército
│   │   └── ...
│   ├── services/
│   │   └── apiService.ts             # Cliente HTTP geral
│   ├── data/
│   │   └── constants.ts              # Constantes do jogo
│   └── types/
│       └── game.ts                   # Tipos TypeScript
├── server.ts                         # Servidor Express
└── data/
    └── ai-maps.json                  # Metadados dos mapas gerados
```

## 🛠️ Tecnologias

- **Frontend:** React, TypeScript, Tailwind CSS, Lucide Icons
- **Backend:** Node.js, Express, PostgreSQL
- **Storage:** Firebase Storage (imagens dos mapas)
- **Deploy:** Vercel (frontend + backend)

## 📝 Scripts Disponíveis

- `npm start` — Inicia o servidor de desenvolvimento
- `npm run build` — Build de produção
- `npm run lint` — Verifica erros de TypeScript
- `npm run deploy:vercel` — Deploy para Vercel

## 🐛 Troubleshooting

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
