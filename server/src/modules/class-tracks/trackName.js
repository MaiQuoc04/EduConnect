// FE-04 UC-26: the grade of a class type (owner: Khanh).
// ASSUMPTION (agreed 01/11, no schema change): a class type belongs to one grade, kept as a prefix of
// class_tracks.track_name – "10 · Khối A" – so that its subjects and periods (track_subjects) differ per grade.
// A name without the prefix is a type for every grade (types created before this change). Always compose and read
// the name with these helpers; never cut the string anywhere else.

const SEPARATOR = ' · ';
const PREFIX = /^(10|11|12) · (.+)$/;

// "10 · Khối A" -> { gradeLevel: '10', name: 'Khối A' }; "Khối A" -> { gradeLevel: null, name: 'Khối A' }.
export function parseTrackName(trackName) {
  const match = PREFIX.exec(trackName ?? '');
  return match ? { gradeLevel: match[1], name: match[2] } : { gradeLevel: null, name: trackName ?? '' };
}

export const composeTrackName = (gradeLevel, name) => (gradeLevel ? `${gradeLevel}${SEPARATOR}${name}` : name);

// A typed name must not look like it carries a grade itself.
export const hasGradePrefix = (name) => PREFIX.test(name);

// Adds { gradeLevel, name } to a row that has trackName.
export const withTrackGrade = (row) => ({ ...row, ...parseTrackName(row.trackName) });

// A class type can be used for a class of this grade (a type for every grade fits all).
export const trackFitsGrade = (trackName, gradeLevel) => {
  const own = parseTrackName(trackName).gradeLevel;
  return !own || own === String(gradeLevel);
};
