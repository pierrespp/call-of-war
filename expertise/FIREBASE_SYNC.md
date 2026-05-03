# Sincronização Firebase & WebRTC (FIREBASE_SYNC)

## Princípios Core
1. **Single Source of Truth**: O Firebase (`firestore.rules`) é a autoridade máxima. O cliente apenas prevê (optimistic UI) a resolução do servidor.
2. **Update Gaps & Race Conditions**: Em caso de ações simultâneas (muito comum em VTT), prefira transações (`runTransaction`) para atualizações em arrays de soldados ou HP.
3. **Otimização de Leituras**: Use `onSnapshot` de maneira cirúrgica. Escute apenas os documentos abertos/ativos. Não cause vazamento de memória (sempre faça o `unsubscribe`).

## Checklist Antes de Alterar
- [ ] Esta operação precisa de um `existsAfter` ou verificação de permissão no servidor?
- [ ] O componente React está limpando corretamente os listeners quando desmontado?
- [ ] Houve quebra no esquema de dados? (Avisar o usuário para atualizar `firestore.rules`).
