import { useState } from 'react';
import { ImageUploadManager } from './ImageUploadManager';
import { migrateImagesToFirebase, checkFirebaseImages } from '../utils/migrateImages';
import { useImages } from '../contexts/ImageContext';
import { useMaps } from '../contexts/MapContext';

export const AdminPanel = ({ onClose }: { onClose: () => void }) => {
  const [migrating, setMigrating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string>('');
  const { refreshImages } = useImages();
  const { refreshMaps } = useMaps();

  // Map Registration State
  const [mapId, setMapId] = useState('');
  const [mapName, setMapName] = useState('');
  const [gridWidth, setGridWidth] = useState(40);
  const [gridHeight, setGridHeight] = useState(40);
  const [mapImagePath, setMapImagePath] = useState('');
  const [registeringMap, setRegisteringMap] = useState(false);

  const handleRegisterMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapId || !mapName || !mapImagePath) {
      alert('Preencha os campos obrigatórios (ID, Nome e Caminho da Imagem)');
      return;
    }
    setRegisteringMap(true);
    try {
      const resp = await fetch('/api/ai-maps/register-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mapId.toLowerCase().replace(/\s+/g, '_'),
          name: mapName,
          imagePath: mapImagePath,
          gridWidth,
          gridHeight,
          coverData: {}
        }),
      });
      if (!resp.ok) throw new Error('Erro ao salvar mapa');
      alert('✓ Mapa registrado com sucesso!');
      await refreshMaps();
      // Clear fields
      setMapId('');
      setMapName('');
      setMapImagePath('');
    } catch (err) {
      alert('Erro: ' + (err instanceof Error ? err.message : 'Erro desconhecido'));
    } finally {
      setRegisteringMap(false);
    }
  };

  const handleMigrate = async () => {
    setMigrating(true);
    setStatus('Migrando imagens para o Firebase...');
    try {
      await migrateImagesToFirebase();
      setStatus('✓ Migração concluída com sucesso!');
      await refreshImages();
    } catch (error) {
      setStatus('✗ Erro na migração: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    } finally {
      setMigrating(false);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    setStatus('Verificando imagens no Firebase...');
    try {
      const { existing, missing } = await checkFirebaseImages();
      setStatus(
        `Encontradas ${existing.length} imagens no Firebase.\n` +
        (missing.length > 0 ? `Faltando: ${missing.join(', ')}` : '✓ Todas as imagens estão presentes!')
      );
    } catch (error) {
      setStatus('✗ Erro ao verificar: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-neutral-900 border-b border-neutral-700 p-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-neutral-200">Painel de Administração</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <h3 className="text-xl font-bold text-neutral-200 mb-4">Migração de Imagens</h3>
            <p className="text-neutral-400 text-sm mb-4">
              Migre as imagens locais da pasta /public/roles/ para o Firebase Storage.
              Isso precisa ser feito apenas uma vez.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleCheck}
                disabled={checking || migrating}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
              >
                {checking ? 'Verificando...' : 'Verificar Status'}
              </button>

              <button
                onClick={handleMigrate}
                disabled={migrating || checking}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
              >
                {migrating ? 'Migrando...' : 'Migrar Imagens'}
              </button>
            </div>

            {status && (
              <div className="mt-4 bg-neutral-900 border border-neutral-700 rounded p-4">
                <pre className="text-sm text-neutral-300 whitespace-pre-wrap font-mono">
                  {status}
                </pre>
              </div>
            )}
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <h3 className="text-xl font-bold text-neutral-200 mb-4">Upload Manual</h3>
            <p className="text-neutral-400 text-sm mb-4">
              Faça upload de novas imagens (Roles, Mapas ou Tokens).<br/>
              <i>Dica: Após o upload de um mapa, copie a URL gerada para usá-la no registro abaixo.</i>
            </p>
            <ImageUploadManager />
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <h3 className="text-xl font-bold text-neutral-200 mb-4">Registrar Novo Mapa</h3>
            <p className="text-neutral-400 text-sm mb-4">
              Crie uma entrada de mapa jogável ligada a uma imagem (URL do Firebase ou caminho local).
            </p>
            <form onSubmit={handleRegisterMap} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">ID do Mapa (slug)</label>
                  <input
                    type="text"
                    value={mapId}
                    onChange={e => setMapId(e.target.value)}
                    placeholder="ex: desert_storm"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Nome de Exibição</label>
                  <input
                    type="text"
                    value={mapName}
                    onChange={e => setMapName(e.target.value)}
                    placeholder="ex: Tempestade no Deserto"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">URL da Imagem / Caminho</label>
                <input
                  type="text"
                  value={mapImagePath}
                  onChange={e => setMapImagePath(e.target.value)}
                  placeholder="https://firebasestorage... ou /maps/meu_mapa.jpg"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Largura (Grades)</label>
                  <input
                    type="number"
                    value={gridWidth}
                    onChange={e => setGridWidth(parseInt(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Altura (Grades)</label>
                  <input
                    type="number"
                    value={gridHeight}
                    onChange={e => setGridHeight(parseInt(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={registeringMap}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-neutral-700 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                {registeringMap ? 'Registrando...' : 'Registrar Mapa'}
              </button>
            </form>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <h3 className="text-xl font-bold text-neutral-200 mb-4">Informações</h3>
            <div className="space-y-2 text-sm text-neutral-400">
              <p>• As imagens são salvas no Firebase Storage</p>
              <p>• Os metadados são salvos no Firestore</p>
              <p>• O sistema usa fallback para imagens locais se não encontrar no Firebase</p>
              <p>• Tokens e configurações também são salvos automaticamente</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
