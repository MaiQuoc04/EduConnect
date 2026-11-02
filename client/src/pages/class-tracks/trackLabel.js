// A class type with its grade, for places that list types of several grades ("Khối A" can exist once per grade).
// gradeLevel is null for a type used by every grade (class_tracks.grade_level_id).
export const trackLabel = (t) => (t.gradeLevel ? `${t.trackName} · khối ${t.gradeLevel}` : t.trackName);
