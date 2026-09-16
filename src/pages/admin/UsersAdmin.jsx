import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Pill, EmptyState, inputClass } from '../../components/ui';
import { DEPARTMENTS } from '../../lib/constants';

const ROLES = [
  { key: 'pending', label: 'পেন্ডিং' },
  { key: 'admin', label: 'অ্যাডমিন' },
  { key: 'merchandising', label: 'মার্চেন্ডাইজিং' },
  { key: 'production', label: 'প্রোডাকশন' },
  { key: 'store', label: 'স্টোর' },
];

export default function UsersAdmin() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return unsub;
  }, []);

  async function setRole(id, role) {
    const isPending = role === 'pending';
    await updateDoc(doc(db, 'users', id), {
      role,
      status: isPending ? 'pending' : 'active',
      department: isPending ? null : role,
    });
  }

  async function toggleActive(id, currentStatus, role) {
    await updateDoc(doc(db, 'users', id), {
      status: currentStatus === 'active' ? 'disabled' : 'active',
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">ইউজার ম্যানেজমেন্ট</h1>
        <p className="mt-1 text-sm text-ink-soft">নতুন অ্যাকাউন্ট অনুমোদন করুন এবং ডিপার্টমেন্ট নির্ধারণ করুন।</p>
      </div>

      {users === null ? (
        <p className="text-sm text-ink-soft">লোড হচ্ছে…</p>
      ) : users.length === 0 ? (
        <EmptyState title="কোনো ইউজার নেই" />
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-soft">
                <th className="px-4 py-3 font-medium">নাম</th>
                <th className="px-4 py-3 font-medium">ইমেইল</th>
                <th className="px-4 py-3 font-medium">ডিপার্টমেন্ট / রোল</th>
                <th className="px-4 py-3 font-medium">অবস্থা</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-ink">{u.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => setRole(u.id, e.target.value)}
                      className={`${inputClass} !w-auto`}
                      disabled={u.id === currentUser.uid}
                    >
                      {ROLES.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={u.status === 'active' ? 'green' : u.status === 'pending' ? 'amber' : 'red'}>
                      {u.status === 'active' ? 'সক্রিয়' : u.status === 'pending' ? 'অপেক্ষমাণ' : 'নিষ্ক্রিয়'}
                    </Pill>
                  </td>
                  <td className="px-4 py-3">
                    {u.id !== currentUser.uid && u.status !== 'pending' && (
                      <button
                        onClick={() => toggleActive(u.id, u.status)}
                        className="text-xs font-medium text-indigo hover:underline"
                      >
                        {u.status === 'active' ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
