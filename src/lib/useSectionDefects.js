import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { seedDefectsFor } from './defectSeed';

// Combines the factory-supplied seed defect list for a section with any
// custom defects someone has added on the floor (stored once, shared by
// everyone, in defectTypes/{section}.items). Call addCustomDefect(label)
// to add a brand new one — it becomes available immediately for this and
// every future QC entry against that section.
export function useSectionDefects(section) {
  const [custom, setCustom] = useState([]);

  useEffect(() => {
    if (!section) {
      setCustom([]);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'defectTypes', section),
      (snap) => setCustom(snap.exists() ? snap.data().items || [] : []),
      () => setCustom([])
    );
    return unsub;
  }, [section]);

  const seed = seedDefectsFor(section);
  const seedKeys = new Set(seed.map((d) => d.key));
  const merged = [...seed, ...custom.filter((d) => !seedKeys.has(d.key))];

  async function addCustomDefect(label) {
    const trimmed = (label || '').trim();
    if (!trimmed || !section) return null;
    const key = `custom_${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}_${Date.now()
      .toString(36)
      .slice(-4)}`;
    const entry = { key, label: trimmed };
    await setDoc(doc(db, 'defectTypes', section), { items: arrayUnion(entry) }, { merge: true });
    return entry;
  }

  return { defects: merged, addCustomDefect };
}
