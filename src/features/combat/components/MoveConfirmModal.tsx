import React from "react";
import { Move, MousePointerClick, X } from "lucide-react";

interface Props {
  pendingPath: { gx: number; gy: number }[];
  costMeters: number;
  onConfirmAuto: () => void;
  onSwitchManual: () => void;
  onCancel: () => void;
}

export function MoveConfirmModal({ pendingPath, costMeters, onConfirmAuto, onSwitchManual, onCancel }: Props) {
  const cells = pendingPath.length - 1;
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-6">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-600/20 text-green-400 rounded-full flex items-center justify-center">
              <Move size={20} />
            </div>
            <div>
              <h3 className="font-black text-white text-lg leading-tight">Confirmar Movimento</h3>
              <p className="text-xs text-neutral-500">{cells} célula(s) · {costMeters.toFixed(1)} m</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-neutral-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-neutral-400 mb-5">
          O caminho automático destacado no mapa leva sua unidade até o destino.
          Você pode confirmá-lo ou montar o caminho manualmente, clicando célula por célula.
        </p>

        <div className="grid grid-cols-1 gap-2">
          <button
            onClick={onConfirmAuto}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Move size={16} /> Confirmar caminho automático
          </button>
          <button
            onClick={onSwitchManual}
            className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors border border-neutral-700"
          >
            <MousePointerClick size={16} /> Construir manualmente
          </button>
          <button
            onClick={onCancel}
            className="w-full text-neutral-500 hover:text-neutral-300 text-sm py-2 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
