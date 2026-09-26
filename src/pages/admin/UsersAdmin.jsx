import { Fragment, useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Pill, EmptyState, inputClass, btnSecondary } from '../../components/ui';
import { ALL_SECTIONS, ADMIN_AREAS, isYarnOverageApprover } from '../../lib/constants';
import { useLang } from '../../lib/i18n';

export default function UsersAdmin() {
  const { user: currentUser } = useAuth();
  const { t, lang } = useLang();
  const [users, setUsers] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const ROLES = [
    { key: 'pending', label: t('পেন্ডিং', 'Pending') },
    { key: 'admin', label: t('অ্যাডমিন', 'Admin') },
    { key: 'merchandising', label: t('মার্চেন্ডাইজিং', 'Merchandising') },
    { key: 'production', label: t('প্রোডাকশন', 'Production') },
    { key: 'store', label: t('স্টোর', 'Store') },
    { key: 'gpq', label: t('GPQ (গ্রুপ কোয়ালিটি)', 'GPQ (Group Quality)') },
    { key: 'ie', label: t('IE (ইন্ডাস্ট্রিয়াল ইঞ্জিনিয়ারিং)', 'IE (Industrial Engineering)') },
  ];

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

  async function toggleActive(id, currentStatus) {
    await updateDoc(doc(db, 'users', id), {
      status: currentStatus === 'active' ? 'disabled' : 'active',
    });
  }

  async function toggleSection(u, sectionKey) {
    const current = Array.isArray(u.sections) ? u.sections : [];
    const next = current.includes(sectionKey)
      ? current.filter((s) => s !== sectionKey)
      : [...current, sectionKey];
    await updateDoc(doc(db, 'users', u.id), { sections: next });
  }

  async function toggleAdminArea(u, areaKey) {
    const current = Array.isArray(u.adminAreas) ? u.adminAreas : [];
    const next = current.includes(areaKey)
      ? current.filter((a) => a !== areaKey)
      : [...current, areaKey];
    await updateDoc(doc(db, 'users', u.id), { adminAreas: next });
  }

  async function toggleYarnApprover(u) {
    await updateDoc(doc(db, 'users', u.id), { canApproveYarnOverage: !u.canApproveYarnOverage });
  }

  async function handleDelete(u) {
    if (u.id === currentUser.uid) return;
    const ok = window.confirm(
      t(`${u.name}-কে মুছে ফেলতে চান?`, `Delete ${u.name}? This cannot be undone.`)
    );
    if (!ok) return;
    await deleteDoc(doc(db, 'users', u.id));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('ইউজার ম্যানেজমেন্ট', 'User Management')}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {t(
            'নতুন অ্যাকাউন্ট অনুমোদন করুন, ডিপার্টমেন্ট এবং নির্দিষ্ট সেকশন (যেমন শুধু নিটিং, বা শুধু ওয়াশ) নির্ধারণ করুন — যাকে যে সেকশন দেওয়া হবে সে শুধু সেই সেকশনেই এন্ট্রি দিতে পারবে।',
            'Approve new accounts, set department, and assign specific sections (e.g. only Knitting, or only Wash) — a user can only enter data for the sections assigned to them.'
          )}
        </p>
      </div>

      {users === null ? (
        <p className="text-sm text-ink-soft">{t('লোড হচ্ছে…', 'Loading…')}</p>
      ) : users.length === 0 ? (
        <EmptyState title={t('কোনো ইউজার নেই', 'No users')} />
      ) : (
        <div className="scroll-thin overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-soft">
                <th className="px-4 py-3 font-medium">{t('নাম', 'Name')}</th>
                <th className="px-4 py-3 font-medium">{t('ইমেইল', 'Email')}</th>
                <th className="px-4 py-3 font-medium">{t('ডিপার্টমেন্ট / রোল', 'Department / Role')}</th>
                <th className="px-4 py-3 font-medium">{t('অবস্থা', 'Status')}</th>
                <th className="px-4 py-3 font-medium">{t('সেকশন', 'Sections')}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <tr className="border-b border-line last:border-0">
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
                        {u.status === 'active'
                          ? t('সক্রিয়', 'Active')
                          : u.status === 'pending'
                          ? t('অপেক্ষমাণ', 'Pending')
                          : t('নিষ্ক্রিয়', 'Disabled')}
                      </Pill>
                    </td>
                    <td className="px-4 py-3">
                      {u.role !== 'pending' && u.role !== 'admin' && (
                        <button
                          onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-indigo hover:underline"
                        >
                          {t('অ্যাক্সেস', 'Access')}
                          {expanded === u.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.id !== currentUser.uid && u.status !== 'pending' && (
                          <button
                            onClick={() => toggleActive(u.id, u.status)}
                            className="text-xs font-medium text-indigo hover:underline"
                          >
                            {u.status === 'active' ? t('নিষ্ক্রিয় করুন', 'Disable') : t('সক্রিয় করুন', 'Enable')}
                          </button>
                        )}
                        {u.id !== currentUser.uid && (
                          <button onClick={() => handleDelete(u)} className="text-red hover:opacity-70">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === u.id && u.role !== 'pending' && u.role !== 'admin' && (
                    <tr className="border-b border-line bg-paper/60">
                      <td colSpan={6} className="space-y-4 px-4 py-3">
                        {(u.role === 'production' || u.role === 'store' || u.role === 'gpq') && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-ink-soft">
                              {t('এই ইউজার শুধু নিচের টিক দেওয়া সেকশনগুলোতে এন্ট্রি দিতে পারবে:', 'This user can only enter data for the checked sections below:')}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {ALL_SECTIONS.map((s) => {
                                const active = (u.sections || []).includes(s.key);
                                return (
                                  <button
                                    key={s.key}
                                    type="button"
                                    onClick={() => toggleSection(u, s.key)}
                                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                      active
                                        ? 'border-indigo bg-indigo text-white'
                                        : 'border-line bg-surface text-ink-soft hover:bg-paper'
                                    }`}
                                  >
                                    {lang === 'en' ? s.labelEn : s.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <div>
                          <p className="mb-2 text-xs font-medium text-ink-soft">
                            {t(
                              'নিচের যে এরিয়াগুলো টিক দেওয়া হবে, সেখানে এই ইউজার এডিট/ডিলিট/ম্যানেজের মতো অ্যাডমিন-লেভেল অ্যাক্সেস পাবে (যেমন GPQ-কে কোয়ালিটি, IE-কে প্রোডাকশন/রিপোর্ট):',
                              "Checking an area below gives this user admin-level (edit/delete/manage) access within just that area (e.g. give GPQ 'Quality', give IE 'Production'/'Reports'):"
                            )}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {ADMIN_AREAS.map((a) => {
                              const active = (u.adminAreas || []).includes(a.key);
                              return (
                                <button
                                  key={a.key}
                                  type="button"
                                  onClick={() => toggleAdminArea(u, a.key)}
                                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                    active
                                      ? 'border-amber bg-amber text-white'
                                      : 'border-line bg-surface text-ink-soft hover:bg-paper'
                                  }`}
                                >
                                  {lang === 'en' ? a.labelEn : a.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-4">
                          <p className="mb-2 text-xs font-medium text-ink-soft">
                            {t(
                              'ইয়ার্ন ইস্যু অনুমোদনকারী (হায়ার অথরিটি): টিক দিলে এই ইউজার স্ট্যান্ডার্ড কনজাম্পশন + ১০%-এর বেশি ইয়ার্ন ইস্যু রিকোয়েস্ট অনুমোদন/বাতিল করতে পারবে (যেমন Admin, PD, MD, DGM)।',
                              'Yarn issue approver (Higher Authority): if checked, this user can approve/reject yarn issue requests that exceed standard consumption + 10% (e.g. Admin, PD, MD, DGM).'
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleYarnApprover(u)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              isYarnOverageApprover(u) && u.role !== 'admin'
                                ? 'border-indigo bg-indigo text-white'
                                : 'border-line bg-surface text-ink-soft hover:bg-paper'
                            }`}
                            disabled={u.role === 'admin'}
                          >
                            {u.role === 'admin'
                              ? t('অ্যাডমিন সবসময় অনুমোদন করতে পারে', 'Admin can always approve')
                              : u.canApproveYarnOverage
                              ? t('✓ অনুমোদনকারী হিসেবে সেট করা আছে', '✓ Set as approver')
                              : t('অনুমোদনকারী হিসেবে সেট করুন', 'Set as approver')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
