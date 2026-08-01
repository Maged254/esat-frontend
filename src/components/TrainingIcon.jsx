import React from 'react';
import TRAINING_ICONS from '../trainingIcons';
export { TRAINING_ICON_LIST } from '../trainingIcons';

// The original ETMS course names → icon slug, so standard courses still show
// the right icon on rows that predate the DB `icon` column (or before the
// backend backfill deploys). A renamed course won't match here — that's why the
// slug is stored on the course and pickable in Admin.
const LEGACY_NAME_TO_KEY = {
  'defensive driving': 'defensive_driving',
  'fall arrest & basic rescue technician': 'fall_arrest',
  'rope rigging technician': 'rope_rigging',
  'general safety and pole climbing': 'pole_climbing',
  'basic competency and safety in power systems': 'power_systems',
  'fire fighting': 'fire_fighting',
  'first aid': 'first_aid',
  'hazard identification & risk assessment': 'hira',
  'driving license': 'driving_license',
  'medical certificate': 'medical',
  'ehs induction': 'ehs_induction',
};

// Resolve a course's icon: prefer the stored slug (stable across renames);
// fall back to the original course name; otherwise a neutral Tabler certificate.
export function resolveIconKey(iconKey, name) {
  if (iconKey && TRAINING_ICONS[iconKey]) return iconKey;
  const legacy = name && LEGACY_NAME_TO_KEY[name.trim().toLowerCase()];
  if (legacy && TRAINING_ICONS[legacy]) return legacy;
  return null;
}

export default function TrainingIcon({ iconKey, name, size = 40, color }) {
  const key = resolveIconKey(iconKey, name);
  const icon = key && TRAINING_ICONS[key];
  if (!icon) return <i className="ti ti-certificate" style={{ fontSize: size, color }} aria-hidden="true" />;
  return (
    <svg viewBox={icon.vb} width={size} height={size} style={{ color, display: 'block' }} aria-hidden="true" focusable="false">
      <path fill="currentColor" fillRule="evenodd" d={icon.d} />
    </svg>
  );
}
