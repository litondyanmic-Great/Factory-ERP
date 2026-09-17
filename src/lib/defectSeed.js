// Preset ("seed") defect names per production/QC section, exactly as
// supplied by the factory. These are shown by default in the QC Entry
// form for each section. Anyone entering QC can also add a brand new
// defect name for a section at any time (see qualityChecks pages) — that
// custom addition is saved to the `defectTypes/{section}` Firestore doc so
// it shows up for everyone from then on, on top of this seed list.
//
// Keys are slugified from the label so they stay stable/short in Firestore
// documents; the label itself (as given by the factory) is what's shown
// and exported, in both Bangla and English UI (same text — these are
// standard floor/QC terms used as-is).
function slugify(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function build(labels) {
  return labels.map((label) => ({ key: slugify(label), label }));
}

export const SEED_DEFECTS = {
  knitting: build([
    'Needle Drop/Needle Mark',
    'Tension Loose/Tight',
    'Uneven Yarn Dyeing',
    'Yarn Contamination (Not Visible Outside - Minor) Puckering Yarn',
    "Nylon Show/Cotton Missing",
    'Color Shade/Dust Yarn',
    'Thick-thin Yarn/Wrong Yarn',
    'Starting Loose/Tight',
    'Sleeve Both Side Up/Down',
    'Measurement Problem',
    'Side Up/Down',
    'Bottom & Cuff Rib Elastic Colour Shade',
    'Hole/Single Ply',
    'Oil Spot/Dirty Mark',
  ]),
  linking: build([
    'Needle Drop',
    'Open Seam',
    'Rib/Cuff/Bottom/Sleeve Joint Up-Down',
    'Armhole/Shoulder Up-Down',
    'Skip Stitch / False Stitch',
    'Uneven/Poor Neck Shape',
    'Linking Yarn/Color Shade',
    'Stripe/Color Up-Down',
    'Pocket Joint Up-Down',
    'Measurement Up-Down',
    'Tension Loose / Tight',
    'Neck/Piping/Size Mistake',
    'Minimum Neck Stitch',
    'L. M. G.',
  ]),
  trimming: build([
    'Needle Drop',
    'Tuck Missing/Burtuck Missing',
    'Rib Cuff/Bottom Up-Down',
    'Loose Yarn/Uncut',
    'Wrong Mending',
    'Hiding Missing',
    'Linking False Stitch',
    'Oil/Dirty Spot',
    'Others',
  ]),
  mending: build([
    'Needle Drop',
    'Tuck Missing/Burtuck Missing',
    'Rib Cuff/Bottom Up-Down',
    'Loose Yarn/Uncut',
    'Wrong Mending',
    'Hiding Missing',
    'Linking False Stitch',
    'Oil/Dirty Spot',
    'Others',
  ]),
  lightCheck: build([
    'Needle Drop',
    'Tuck Missing/Burtuck Missing',
    'Rib Cuff/Bottom Up-Down',
    'Loose Yarn/Uncut',
    'Wrong Mending',
    'Hiding Missing',
    'Linking False Stitch',
    'Oil/Dirty Spot',
    'Others',
  ]),
  pqc: build([
    'Oil/Dirty Spot',
    'Tuck Problem',
    'Drop Needle/Hole',
    'Knot/Loose Yarn',
    'Label Open Stitch/Slanted',
    'Neck Tape Open',
    'Wrong Mending',
    'Needle Count',
    'Pull Out',
    'Color Shade',
    'Un-cut',
    'Others',
  ]),
  wash: build([
    'Color Shade',
    'Puckering',
    'Color Bleeding',
    'Contamination/Visible Nylon',
    'Dirty Spot',
    'Handfeel Problem',
    'Oil Spot',
    'Dyer High/Low',
    'Chemical Spot/N.M',
    'Others',
  ]),
  sewing: build([
    'Open Stitch',
    'Slanted Label',
    'Contrast Color',
    'Skip Stitch/Broken Stitch',
    'Oil/Dirty Spot',
    'Neck Tape Open',
    'Join Stitch',
    'Needle Cut',
    'Size Mistake/Style Mistake',
    'Color Mistake',
    'Measurement Problem',
    'Others',
  ]),
  iron: build([
    'Neck Width (+/-)',
    'Front Neck Drop (+/-)',
    'Shoulder Problem (+/-)',
    'Armhole/Neck Shape Poor (+/-)',
    'Breast Problem (+/-)',
    'Chest Problem (+/-)',
    'Rib/Cuff (+/-)',
    'Body Length (+/-)',
    'Sleeve Length (+/-)',
    'Center Front (+/-)',
    'Sleeve Up-Down',
    'Others',
  ]),
  attachment: build([
    'Open Stitch',
    'Slanted',
    'Contrast Color',
    'Skip Stitch/Broken Stitch',
    'Oil/Dirty Spot',
    'Neck Tape Open',
    'Join Stitch',
    'Zipper Up-Down',
    'Zipper Size Mistake/Style Mistake',
    'Color Mistake',
    'Tape Wavy',
    'Others',
  ]),
  // No factory-supplied list yet for Getup/Packing — starts empty, and
  // anyone doing QC for these sections can add defect names as they come
  // up (they'll then show for everyone going forward).
  getup: [],
  packing: [],
};

export function seedDefectsFor(section) {
  return SEED_DEFECTS[section] || [];
}
