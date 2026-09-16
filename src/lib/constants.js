// Production pipeline stages for a sweater (knitwear) factory, in order.
export const STAGES = [
  { key: 'knitting', label: 'নিটিং' },
  { key: 'linking', label: 'লিংকিং' },
  { key: 'mending', label: 'মেন্ডিং/ট্রিমিং' },
  { key: 'washing', label: 'ওয়াশিং' },
  { key: 'finishing', label: 'ফিনিশিং' },
  { key: 'packing', label: 'প্যাকিং' },
];

export const STAGE_KEYS = STAGES.map((s) => s.key);

export const DEPARTMENTS = [
  { key: 'admin', label: 'অ্যাডমিন' },
  { key: 'merchandising', label: 'মার্চেন্ডাইজিং' },
  { key: 'production', label: 'প্রোডাকশন' },
  { key: 'store', label: 'স্টোর / ইনভেন্টরি' },
];

export const ITEM_TYPES = [
  { key: 'yarn', label: 'ইয়ার্ন' },
  { key: 'accessory', label: 'এক্সেসরিজ' },
];

// role -> permissions
export function can(role, action) {
  if (role === 'admin') return true;
  const table = {
    merchandising: ['style:create', 'style:edit', 'style:view', 'inventory:view'],
    production: ['style:view', 'production:entry', 'inventory:view'],
    store: ['inventory:manage', 'inventory:view', 'style:view'],
  };
  return (table[role] || []).includes(action);
}

export function emptyStageMap(fill = 0) {
  return Object.fromEntries(STAGE_KEYS.map((k) => [k, fill]));
}
