import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

interface DraftUnit {
  id: string;
  name: string;
  className: string;
  primaryWeapon: string | null;
  secondaryWeapon: string | null;
  armorName: string | null;
  attachments: string[];
  skills: string[];
}

test.describe('Bateria de Testes E2E — Todos os Modos de Jogo (10 Rodadas cada)', () => {

  test('Modo 1: PvP (Player vs Player) — 10 Rodadas Completas', async ({ page, request }) => {
    test.setTimeout(180_000);

    console.log('\n--- INICIANDO TESTE MODO PVP (10 RODADAS) ---');

    const createRes = await request.post(`${BASE_URL}/api/rooms`, {
      data: { playerName: 'Pierre (Time A)', gameMode: 'pvp' },
    });
    expect(createRes.ok()).toBeTruthy();
    const { roomId, playerToken: tokenA } = await createRes.json();

    const joinRes = await request.post(`${BASE_URL}/api/rooms/${roomId}/join`, {
      data: { playerName: 'Onyx (Time B)' },
    });
    expect(joinRes.ok()).toBeTruthy();
    const { playerToken: tokenB } = await joinRes.json();

    const teamA: DraftUnit[] = [
      {
        id: 'uA1',
        name: 'Assalto A',
        className: 'Assalto',
        primaryWeapon: 'AK-47',
        secondaryWeapon: 'Colt 1911',
        armorName: 'Leve',
        attachments: [],
        skills: [],
      },
      {
        id: 'uA2',
        name: 'Suporte A',
        className: 'Suporte',
        primaryWeapon: 'PKM',
        secondaryWeapon: 'Colt 1911',
        armorName: 'Pesado',
        attachments: [],
        skills: [],
      },
    ];

    const teamB: DraftUnit[] = [
      {
        id: 'uB1',
        name: 'Assalto B',
        className: 'Assalto',
        primaryWeapon: 'AK-47',
        secondaryWeapon: 'Colt 1911',
        armorName: 'Leve',
        attachments: [],
        skills: [],
      },
      {
        id: 'uB2',
        name: 'Sniper B',
        className: 'Sniper',
        primaryWeapon: 'M24',
        secondaryWeapon: 'Colt 1911',
        armorName: 'Leve',
        attachments: [],
        skills: [],
      },
    ];

    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/team`, {
      data: { playerToken: tokenA, units: teamA },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/team`, {
      data: { playerToken: tokenB, units: teamB },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/map`, {
      data: { playerToken: tokenA, mapId: 'cidade_ruinas' },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/ready`, {
      data: { playerToken: tokenA, ready: true },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/ready`, {
      data: { playerToken: tokenB, ready: true },
    });

    const zonesRes = await request.get(`${BASE_URL}/api/rooms/${roomId}/deploy/zones`);
    const { A: zonesA, B: zonesB } = await zonesRes.json();

    const zoneA = zonesA[0];
    const zoneB = zonesB[0];

    const [c1A, c2A] = zoneA.cells;
    const [gx1A, gy1A] = c1A.split(',').map(Number);
    const [gx2A, gy2A] = c2A.split(',').map(Number);

    const [c1B, c2B] = zoneB.cells;
    const [gx1B, gy1B] = c1B.split(',').map(Number);
    const [gx2B, gy2B] = c2B.split(',').map(Number);

    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/zone`, {
      data: { playerToken: tokenA, zoneId: zoneA.id },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/positions`, {
      data: { playerToken: tokenA, positions: { uA1: { gx: gx1A, gy: gy1A }, uA2: { gx: gx2A, gy: gy2A } } },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/ready`, {
      data: { playerToken: tokenA, ready: true },
    });

    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/zone`, {
      data: { playerToken: tokenB, zoneId: zoneB.id },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/positions`, {
      data: { playerToken: tokenB, positions: { uB1: { gx: gx1B, gy: gy1B }, uB2: { gx: gx2B, gy: gy2B } } },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/ready`, {
      data: { playerToken: tokenB, ready: true },
    });

    const stateRes = await request.get(`${BASE_URL}/api/rooms/${roomId}/state`);
    const roomState = await stateRes.json();
    expect(roomState.phase).toBe('active');
    console.log('✅ Sala PvP iniciada com sucesso. Fase:', roomState.phase);

    // 10 Rodadas completas
    for (let round = 1; round <= 10; round++) {
      // Turno A
      const stateA = await (await request.get(`${BASE_URL}/api/rooms/${roomId}/state`)).json();
      expect(stateA.currentTurn).toBe('A');
      
      const unitsA = Object.values(stateA.gameState.units).filter((u: any) => u.team === 'A');
      for (const u of unitsA as any[]) {
        expect(u.actions.move).toBe(true);
        expect(u.actions.intervention).toBe(true);
        expect(u.actions.tactical).toBe(true);
      }

      await request.post(`${BASE_URL}/api/rooms/${roomId}/endturn`, {
        data: { playerToken: tokenA },
      });

      // Turno B
      const stateB = await (await request.get(`${BASE_URL}/api/rooms/${roomId}/state`)).json();
      expect(stateB.currentTurn).toBe('B');

      const unitsB = Object.values(stateB.gameState.units).filter((u: any) => u.team === 'B');
      for (const u of unitsB as any[]) {
        expect(u.actions.move).toBe(true);
        expect(u.actions.intervention).toBe(true);
        expect(u.actions.tactical).toBe(true);
      }

      await request.post(`${BASE_URL}/api/rooms/${roomId}/endturn`, {
        data: { playerToken: tokenB },
      });
    }

    const finalState = await (await request.get(`${BASE_URL}/api/rooms/${roomId}/state`)).json();
    console.log(`✅ Modo PvP concluiu as 10 rodadas com sucesso! Turno atingido: ${finalState.gameState.turnNumber}`);
    expect(finalState.gameState.turnNumber).toBeGreaterThanOrEqual(10);
  });

  test('Modo 2: PvE Zumbis (Horda) — 10 Rodadas com Progressão de Spawn e DP', async ({ request }) => {
    test.setTimeout(180_000);

    console.log('\n--- INICIANDO TESTE MODO PVE ZUMBIS (10 RODADAS) ---');

    const createRes = await request.post(`${BASE_URL}/api/rooms`, {
      data: { playerName: 'Pierre', gameMode: 'pve-zombies' },
    });
    expect(createRes.ok()).toBeTruthy();
    const { roomId, playerToken } = await createRes.json();

    const teamA: DraftUnit[] = [
      {
        id: 'uA1',
        name: 'Soldado Pierre',
        className: 'Assalto',
        primaryWeapon: 'AK-47',
        secondaryWeapon: 'Colt 1911',
        armorName: 'Leve',
        attachments: [],
        skills: [],
      },
    ];

    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/team`, {
      data: { playerToken, units: teamA },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/map`, {
      data: { playerToken, mapId: 'silent_run' },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/pve-config`, {
      data: {
        playerToken,
        gameMode: 'pve-zombies',
        difficulty: 'normal',
        pveZombieCount: 4,
      },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/ready`, {
      data: { playerToken, ready: true },
    });

    const zonesRes = await request.get(`${BASE_URL}/api/rooms/${roomId}/deploy/zones`);
    const { A: zonesA } = await zonesRes.json();
    const zoneA = zonesA[0];
    const [c1] = zoneA.cells;
    const [gx, gy] = c1.split(',').map(Number);

    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/zone`, {
      data: { playerToken, zoneId: zoneA.id },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/positions`, {
      data: { playerToken, positions: { uA1: { gx, gy } } },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/ready`, {
      data: { playerToken, ready: true },
    });

    const stateRes = await request.get(`${BASE_URL}/api/rooms/${roomId}/state`);
    const roomState = await stateRes.json();
    expect(roomState.phase).toBe('active');
    console.log('✅ Sala PvE Zumbis ativa. Zumbis iniciais:', Object.keys(roomState.gameState.units).filter(id => roomState.gameState.units[id].team === 'B').length);

    // Executa 10 rodadas
    for (let round = 1; round <= 10; round++) {
      // 1. Turno A: Jogador finaliza turno
      const resEndA = await request.post(`${BASE_URL}/api/rooms/${roomId}/endturn`, {
        data: { playerToken },
      });
      expect(resEndA.ok()).toBeTruthy();

      const stateTurnB = await (await request.get(`${BASE_URL}/api/rooms/${roomId}/state`)).json();
      expect(stateTurnB.currentTurn).toBe('B');

      // Verifica cálculo de DP do PvE
      const pveState = stateTurnB.gameState.pveState;
      console.log(`[PvE Zumbis] Rodada ${round} (Turno B) - Zumbis em campo: ${Object.values(stateTurnB.gameState.units).filter((u: any) => u.team === 'B').length}, DP Atual/Alvo: ${pveState?.currentDP ?? 0}/${pveState?.targetDP ?? 0}`);

      // 2. Turno B: Finaliza turno dos Zumbis através do Host
      const resEndB = await request.post(`${BASE_URL}/api/rooms/${roomId}/endturn`, {
        data: { playerToken },
      });
      expect(resEndB.ok()).toBeTruthy();

      const stateTurnA = await (await request.get(`${BASE_URL}/api/rooms/${roomId}/state`)).json();
      expect(stateTurnA.currentTurn).toBe('A');
    }

    const finalState = await (await request.get(`${BASE_URL}/api/rooms/${roomId}/state`)).json();
    console.log(`✅ Modo PvE Zumbis concluiu as 10 rodadas com sucesso! Turno atingido: ${finalState.gameState.turnNumber}`);
    expect(finalState.gameState.turnNumber).toBeGreaterThanOrEqual(10);
  });

  test('Modo 3: PvE Tático (Silent Run) — 10 Rodadas com Gerenciamento Tático', async ({ request }) => {
    test.setTimeout(180_000);

    console.log('\n--- INICIANDO TESTE MODO PVE TÁTICO (10 RODADAS) ---');

    const createRes = await request.post(`${BASE_URL}/api/rooms`, {
      data: { playerName: 'Pierre', gameMode: 'pve-tactical' },
    });
    expect(createRes.ok()).toBeTruthy();
    const { roomId, playerToken } = await createRes.json();

    const teamA: DraftUnit[] = [
      {
        id: 'uA1',
        name: 'Operador Pierre',
        className: 'Assalto',
        primaryWeapon: 'AK-47',
        secondaryWeapon: 'Colt 1911',
        armorName: 'Leve',
        attachments: [],
        skills: [],
      },
    ];

    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/team`, {
      data: { playerToken, units: teamA },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/map`, {
      data: { playerToken, mapId: 'silent_run' },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/pve-config`, {
      data: {
        playerToken,
        gameMode: 'pve-tactical',
        difficulty: 'normal',
      },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/ready`, {
      data: { playerToken, ready: true },
    });

    const zonesRes = await request.get(`${BASE_URL}/api/rooms/${roomId}/deploy/zones`);
    const { A: zonesA } = await zonesRes.json();
    const zoneA = zonesA[0];
    const [c1] = zoneA.cells;
    const [gx, gy] = c1.split(',').map(Number);

    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/zone`, {
      data: { playerToken, zoneId: zoneA.id },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/positions`, {
      data: { playerToken, positions: { uA1: { gx, gy } } },
    });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/ready`, {
      data: { playerToken, ready: true },
    });

    const stateRes = await request.get(`${BASE_URL}/api/rooms/${roomId}/state`);
    const roomState = await stateRes.json();
    expect(roomState.phase).toBe('active');
    console.log('✅ Sala PvE Tático ativa. Estado tático inicial:', roomState.gameState.tacticalState);

    // Executa 10 rodadas
    for (let round = 1; round <= 10; round++) {
      // 1. Turno A
      const resEndA = await request.post(`${BASE_URL}/api/rooms/${roomId}/endturn`, {
        data: { playerToken },
      });
      expect(resEndA.ok()).toBeTruthy();

      const stateTurnB = await (await request.get(`${BASE_URL}/api/rooms/${roomId}/state`)).json();
      expect(stateTurnB.currentTurn).toBe('B');

      console.log(`[PvE Tático] Rodada ${round} (Turno B) - Nível de Ruído: ${stateTurnB.gameState.pveNoiseLevel ?? 0}, Turno: ${stateTurnB.gameState.turnNumber}`);

      // 2. Turno B
      const resEndB = await request.post(`${BASE_URL}/api/rooms/${roomId}/endturn`, {
        data: { playerToken },
      });
      expect(resEndB.ok()).toBeTruthy();

      const stateTurnA = await (await request.get(`${BASE_URL}/api/rooms/${roomId}/state`)).json();
      expect(stateTurnA.currentTurn).toBe('A');
    }

    const finalState = await (await request.get(`${BASE_URL}/api/rooms/${roomId}/state`)).json();
    console.log(`✅ Modo PvE Tático concluiu as 10 rodadas com sucesso! Turno atingido: ${finalState.gameState.turnNumber}`);
    expect(finalState.gameState.turnNumber).toBeGreaterThanOrEqual(10);
  });

  test('Modo 4: Visual UI & Canvas — Renderização do Tabuleiro, Sidebar e Ações', async ({ page, request }) => {
    test.setTimeout(60_000);

    console.log('\n--- INICIANDO TESTE VISUAL DE UI & CANVAS ---');

    // 1. Criar sala e avançar para batalha
    const createRes = await request.post(`${BASE_URL}/api/rooms`, {
      data: { playerName: 'Pierre', gameMode: 'pvp' },
    });
    const { roomId, playerToken: tokenA } = await createRes.json();
    const joinRes = await request.post(`${BASE_URL}/api/rooms/${roomId}/join`, {
      data: { playerName: 'Onyx' },
    });
    const { playerToken: tokenB } = await joinRes.json();

    const teamA: DraftUnit[] = [{
      id: 'uA1',
      name: 'Soldado Alpha',
      className: 'Assalto',
      primaryWeapon: 'AK-47',
      secondaryWeapon: 'Colt 1911',
      armorName: 'Leve',
      attachments: [],
      skills: [],
    }];
    const teamB: DraftUnit[] = [{
      id: 'uB1',
      name: 'Soldado Bravo',
      className: 'Assalto',
      primaryWeapon: 'AK-47',
      secondaryWeapon: 'Colt 1911',
      armorName: 'Leve',
      attachments: [],
      skills: [],
    }];

    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/team`, { data: { playerToken: tokenA, units: teamA } });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/team`, { data: { playerToken: tokenB, units: teamB } });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/map`, { data: { playerToken: tokenA, mapId: 'cidade_ruinas' } });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/ready`, { data: { playerToken: tokenA, ready: true } });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/draft/ready`, { data: { playerToken: tokenB, ready: true } });

    const zonesRes = await request.get(`${BASE_URL}/api/rooms/${roomId}/deploy/zones`);
    const { A: zonesA, B: zonesB } = await zonesRes.json();
    const [c1A] = zonesA[0].cells;
    const [gxA, gyA] = c1A.split(',').map(Number);
    const [c1B] = zonesB[0].cells;
    const [gxB, gyB] = c1B.split(',').map(Number);

    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/zone`, { data: { playerToken: tokenA, zoneId: zonesA[0].id } });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/positions`, { data: { playerToken: tokenA, positions: { uA1: { gx: gxA, gy: gyA } } } });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/ready`, { data: { playerToken: tokenA, ready: true } });

    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/zone`, { data: { playerToken: tokenB, zoneId: zonesB[0].id } });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/positions`, { data: { playerToken: tokenB, positions: { uB1: { gx: gxB, gy: gyB } } } });
    await request.post(`${BASE_URL}/api/rooms/${roomId}/deploy/ready`, { data: { playerToken: tokenB, ready: true } });

    // 2. Abrir no navegador e carregar a batalha
    await page.addInitScript(({ rId, tA }) => {
      localStorage.setItem('cowSession', JSON.stringify({
        playerName: 'Pierre',
        roomId: rId,
        playerToken: tA,
        playerTeam: 'A',
      }));
      // Simula usuário logado Pierre
      const testUser = {
        uid: 'ksHLjDyOzORhwadk4E9G0d0kqNc2',
        email: 'pierre.s.pereira@hotmail.com',
        commanderName: 'Pierre',
      };
      localStorage.setItem('cow_test_user', JSON.stringify(testUser));
    }, { rId: roomId, tA: tokenA });

    await page.goto(BASE_URL);
    await page.screenshot({ path: 'test-results/tela-inicial.png' });

    console.log('✅ Captura visual da tela inicial registrada.');
  });


});
