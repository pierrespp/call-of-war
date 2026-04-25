import { useState } from 'react';
import { ImageUploadManager } from './ImageUploadManager';
import { migrateImagesToFirebase, checkFirebaseImages } from '../utils/migrateImages';
import { useImages } from '../contexts/ImageContext';

export const AdminPanel = ({ onClose }: { onClose: () => void }) => {
  const [migrating, setMigrating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string>('');
  const { refreshImages } = useImages();

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
              Faça upload de novas imagens ou substitua imagens existentes.
            </p>
            <ImageUploadManager />
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
