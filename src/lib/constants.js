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
  { key: 'wash', label: 'ওয়াশ', labelEn: 'Wash' },
  { key: 'pqc', label: 'পিকিউসি', labelEn: 'PQC' },
  { key: 'iron', label: 'আয়রন', labelEn: 'Iron' },
  { key: 'getup', label: 'গেটআপ', labelEn: 'Getup' },
  { key: 'packing', label: 'প্যাকিং', labelEn: 'Packing' },
];

export const STAGE_KEYS = STAGES.map((s) => s.key);
export const FINAL_STAGE_KEY = 'packing';

// Winding sits before Knitting in the yarn flow (yarn -> winding -> knitting)
// but it is not a garment-production stage, so it is tracked separately in
// Inventory rather than in the STAGES pipeline above.
export const WINDING_SECTION = { key: 'winding', label: 'ওয়াইন্ডিং', labelEn: 'Winding' };

// All "sections" a staff member could be individually assigned to (used by
// Admin > Users to grant entry rights one section at a time, and by
// Production/Quality entry forms to restrict the section dropdown).
export const ALL_SECTIONS = [WINDING_SECTION, ...STAGES];

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

// Common stock units. Yarn is always tracked in kg (factory standard for
// yarn accounting); accessories/other items can be pcs, dozen, set, etc.
export const YARN_UNIT = 'kg';
export const COMMON_UNITS = ['kg', 'pcs', 'dozen', 'set', 'yard', 'cone', 'box', 'roll'];

// Common sweater-factory defect types used across Quality entry forms.
export const DEFECT_TYPES = [
  { key: 'looseThread', label: 'লুজ থ্রেড', labelEn: 'Loose Thread' },
  { key: 'hole', label: 'হোল', labelEn: 'Hole' },
  { key: 'stain', label: 'দাগ/স্টেইন', labelEn: 'Stain' },
  { key: 'colorShade', label: 'কালার শেড মিসম্যাচ', labelEn: 'Color Shade Mismatch' },
  { key: 'sizeIssue', label: 'সাইজ সমস্যা', labelEn: 'Size Issue' },
  { key: 'stitching', label: 'স্টিচিং ডিফেক্ট', labelEn: 'Stitching Defect' },
  { key: 'accessory', label: 'এক্সেসরিজ ডিফেক্ট', labelEn: 'Accessory Defect' },
  { key: 'measurement', label: 'মেজারমেন্ট সমস্যা', labelEn: 'Measurement Issue' },
  { key: 'needleMark', label: 'নিডল মার্ক', labelEn: 'Needle Mark' },
  { key: 'washIssue', label: 'ওয়াশ সমস্যা', labelEn: 'Wash Issue' },
  { key: 'packing', label: 'প্যাকিং ডিফেক্ট', labelEn: 'Packing Defect' },
  { key: 'other', label: 'অন্যান্য', labelEn: 'Other' },
];

// role -> permissions. Broad module-level gates; fine-grained "which
// section can THIS person enter data for" is handled separately via
// users/{uid}.sections + canEnterSection() below, since two people in the
// same department (e.g. two "production" users) can be limited to
// different stages.
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
      'report:view',
    ],
  };
  return (table[role] || []).includes(action);
}

// A user can enter data for a given section (production stage / winding /
// quality section) if they are admin, OR their profile explicitly lists
// that section in profile.sections. If a user has no sections assigned at
// all, admins/merchandising still fall back to "all" for viewing purposes,
// but entry always requires an explicit assignment for non-admins.
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
