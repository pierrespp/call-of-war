import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const configPath = path.resolve('firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const keywords = ['ruina', 'selva', 'acampamento'];

async function cleanup() {
  console.log('--- Iniciando limpeza agressiva de mapas ---');

  const collections = ['ai-maps', 'tokens'];

  for (const colName of collections) {
    const ref = collection(db, colName);
    const snap = await getDocs(ref);
    
    for (const d of snap.docs) {
      const data = d.data();
      const name = (data.name || '').toLowerCase();
      const id = d.id.toLowerCase();
      
      const shouldDelete = keywords.some(k => name.includes(k) || id.includes(k));
      
      if (shouldDelete) {
        console.log(`Deletando de ${colName}: ${d.id} (${data.name})`);
        await deleteDoc(doc(db, colName, d.id));
      }
    }
  }

  console.log('--- Limpeza concluída ---');
}

cleanup().catch(err => {
  console.error('Erro na limpeza:', err);
});
