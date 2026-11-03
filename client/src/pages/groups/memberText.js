import { RELATIONSHIP_LABELS } from '../../messages.js';

// Second line under a member's name: whose parent they are and / or the subjects they teach in the class.
export function memberSubline(m) {
  const parts = (m.children ?? []).map((c) => `${RELATIONSHIP_LABELS[c.relationship] ?? 'Phụ huynh'} của ${c.fullName}`);
  if (m.subjects?.length) parts.push(m.subjects.join(', '));
  return parts.join(' · ');
}
