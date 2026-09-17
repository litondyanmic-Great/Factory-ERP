// Production pipeline stages for a sweater (knitwear) factory, in order.
// Each stage has a bilingual label and is also used as the "section" key
// for Quality checks and for restricting which staff member can enter data
// against which section (see users/{uid}.sections).
export const STAGES = [
  { key: 'knitting', label: 'নিটিং', labelEn: 'Knitting' },
  { key: 'linking', label: 'লিংকিং', labelEn: 'Linking' },
  { key: 'trimming', label: 'ট্রিমিং', labelEn: 'Trimming' },
  { key: 'mending', label: 'মেন্ডিং', labelEn: 'Mending' },
  { key: 'lightCheck', label: 'লাইট চেক', labelEn: 'Light Check' },
  { key: 'sewing', label: 'সুইং', labelEn: 'Sewing' },
  { key: 'attachment', label: 'অ্যাটাচমেন্ট', labelEn: 'Attachment' },
  { key: 'wash', label: 'ওয়াশ', labelEn: 'Wash' },
  { key: 'pqc', label: 'পিকিউসি', labelEn: 'PQC' },
  { key: 'iron', label: 'আয়রন', labelEn: 'Iron' },
  { key: 'getup', label: 'গেটআপ', labelEn: 'Getup' },
  { key: 'packing', label: 'প্যাকিং', labelEn: 'Packing' },
];

export const STAGE_KEYS = STAGES.map((s) => s.key);
export const FINAL_STAGE_KEY = 'packing';

// Winding and Accessories Store sit alongside the garment-production
// pipeline (yarn -> winding -> knitting, and accessories -> specific
// section) but are not themselves production stages, so they are tracked
// separately in Inventory rather than in the STAGES pipeline above.
export const WINDING_SECTION = { key: 'winding', label: 'ওয়াইন্ডিং', labelEn: 'Winding' };
export const ACCESSORIES_SECTION = { key: 'accessoriesStore', label: 'এক্সেসরিজ স্টোর', labelEn: 'Accessories Store' };
export const YARN_STORE_SECTION = { key: 'yarnStore', label: 'ইয়ার্ন স্টোর', labelEn: 'Yarn Store' };

// All "sections" a staff member could be individually assigned to (used by
// Admin > Users to grant entry rights one section at a time, and by
// Production/Quality/Inventory entry forms to restrict what each person
// can do).
export const ALL_SECTIONS = [YARN_STORE_SECTION, WINDING_SECTION, ACCESSORIES_SECTION, ...STAGES];

export function stageLabel(key, lang = 'bn') {
  const s = ALL_SECTIONS.find((x) => x.key === key);
  if (!s) return key;
  return lang === 'en' ? s.labelEn : s.label;
}

export const DEPARTMENTS = [
  { key: 'admin', label: 'অ্যাডমিন', labelEn: 'Admin' },
  { key: 'merchandising', label: 'মার্চেন্ডাইজিং', labelEn: 'Merchandising' },
  { key: 'production', label: 'প্রোডাকশন', labelEn: 'Production' },
  { key: 'store', label: 'স্টোর / ইনভেন্টরি', labelEn: 'Store / Inventory' },
];

export function departmentLabel(key, lang = 'bn') {
  const d = DEPARTMENTS.find((x) => x.key === key);
  if (!d) return key || '—';
  return lang === 'en' ? d.labelEn : d.label;
}

export const ITEM_TYPES = [
  { key: 'yarn', label: 'ইয়ার্ন', labelEn: 'Yarn' },
  { key: 'accessory', label: 'এক্সেসরিজ', labelEn: 'Accessories' },
];

// Suggested (not locked) accessory item names — shown as datalist
// suggestions when creating a new accessory item, but the user can always
// type something else too.
export const ACCESSORY_NAME_SUGGESTIONS = [
  'Main Label',
  'Care Label',
  'Size Label',
  'Price Sticker',
  'Poly Sticker',
  'Hangtag',
  'Polybag',
];

// Common stock units. Yarn is always tracked in lb (pound) — this is the
// factory's standard for yarn accounting; accessories/other items can be
// pcs, dozen, kg, set, etc. Keep this list short and standard.
export const YARN_UNIT = 'lb';
export const COMMON_UNITS = ['pcs', 'dozen', 'kg', 'lb', 'yard', 'cone', 'box', 'roll', 'set'];

// Production "blocks" / lines (A through M) used to tag which line a QC
// check was done on, alongside Style and Section.
export const BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];

// Sentinel style id used by Quality entry when a check covers a mixed lot
// rather than one specific style.
export const ALL_STYLE_SENTINEL = '__ALL__';
export const ALL_STYLE_LABEL = { bn: 'সব স্টাইল (মিক্সড)', en: 'All Style (Mixed)' };

// role -> permissions. Broad module-level gates; fine-grained "which
// section can THIS person enter data for" is handled separately via
// users/{uid}.sections + canEnterSection() below, since two people in the
// same department (e.g. two "production" users, or two "store" users) can
// be limited to different sections.
export function can(role, action) {
  if (role === 'admin') return true;
  const table = {
    merchandising: [
      'style:create',
      'style:edit',
      'style:view',
      'inventory:view',
      'quality:view',
      'report:view',
    ],
    production: [
      'style:view',
      'production:entry',
      'inventory:view',
      'quality:entry',
      'quality:view',
      'report:view',
    ],
    store: [
      'inventory:manage',
      'inventory:view',
      'style:view',
      'winding:entry',
      'yarnStore:entry',
      'accessories:entry',
      'report:view',
    ],
  };
  return (table[role] || []).includes(action);
}

// A user can enter data for a given section (production stage / winding /
// yarn store / accessories store / quality section) if they are admin, OR
// their profile explicitly lists that section in profile.sections. If a
// user has no sections assigned at all, entry always requires an explicit
// assignment for non-admins.
export function canEnterSection(profile, sectionKey) {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  const sections = Array.isArray(profile.sections) ? profile.sections : [];
  return sections.includes(sectionKey);
}

export function emptyStageMap(fill = 0) {
  return Object.fromEntries(STAGE_KEYS.map((k) => [k, fill]));
}

// Quality traffic-light classification from a pass rate (0-100).
export function qualityTone(passRate, settings) {
  const green = settings?.qualityGreenThreshold ?? 95;
  const yellow = settings?.qualityYellowThreshold ?? 90;
  if (passRate === null || passRate === undefined || Number.isNaN(passRate)) return 'grey';
  if (passRate >= green) return 'green';
  if (passRate >= yellow) return 'amber';
  return 'red';
}
