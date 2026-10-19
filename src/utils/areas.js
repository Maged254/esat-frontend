// OneHub is two areas behind one login: OneHub People (every page that existed
// before Route Patrol) and OneHub Operations. `role` is the People role and
// `patrol_role` the Operations one; each is held independently, so a person can
// have either, both, or -- for admin -- everything.

export const PATROL_ROLES = [
  { value: 'patrol_officer', label: 'Patrol Officer' },
  { value: 'field_supervisor', label: 'Field Supervisor' },
  { value: 'pm_coordinator', label: 'PM Coordinator' },
  { value: 'planner', label: 'Planner' },
  { value: 'director', label: 'Project Director' },
];

export const patrolRoleLabel = (v) => PATROL_ROLES.find(r => r.value === v)?.label || '';

// role 'none' = an Operations-only account with no People pages at all.
export const hasPeople = (user) => !!user && user.role !== 'none';
export const hasOps = (user) => !!user && (user.role === 'admin' || !!user.patrol_role);

export const isOpsPath = (pathname) => pathname === '/ops' || pathname.startsWith('/ops/');

// Where someone lands after signing in: the tile screen only when there is a
// real choice to make, otherwise straight into the one area they have.
export const homeFor = (user) => {
  const areas = userAreas(user);
  if (areas.length > 1) return '/home';
  // An Operations-only patrol officer goes straight to their phone screen.
  if (areas.length === 1 && areas[0] === 'ops' && user?.patrol_role === 'patrol_officer') return '/ops/patrol';
  return areas.length === 1 ? AREAS[areas[0]].home : '/';
};

export const AREAS = {
  people: { name: 'OneHub People', home: '/', logo: '/onehub-people-logo.png' },
  ops: { name: 'OneHub Operations', home: '/ops', logo: '/onehub-operations-logo.png' },
};

// Every area this person can open. Written over the AREAS list rather than as
// a pair, so a third area only has to be added above (and to the home tiles).
const AREA_ACCESS = { people: hasPeople, ops: hasOps };
export const userAreas = (user) => Object.keys(AREAS).filter(k => AREA_ACCESS[k]?.(user));
