import { collection, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

const STYLE_SUBCOLLECTIONS = ['yarnLedger', 'accessoryLedger', 'productionEntries', 'shipments'];

// Firestore never deletes a subcollection just because its parent document
// was deleted — every yarnLedger/accessoryLedger/productionEntries entry
// under a deleted style would otherwise keep existing forever, still
// showing up in Winding Queue, Yarn Block Manager, Reports Center and the
// Dashboard's cross-style queries. This deletes every doc in every known
// subcollection first, then the style doc itself, in batches of 400
// (Firestore's batch write limit is 500).
export async function deleteStyleCascade(styleId) {
  for (const sub of STYLE_SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db, 'styles', styleId, sub));
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await deleteDoc(doc(db, 'styles', styleId));
}
