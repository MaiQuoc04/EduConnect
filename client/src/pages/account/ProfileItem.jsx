// One label / value pair of a profile `dl` (SCR-03 and the child profile). Empty values read "Chưa cập nhật".
export default function ProfileItem({ label, children, wide }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={wide ? 'wide' : undefined}>
      <dt>{label}</dt>
      <dd className={empty ? 'empty' : undefined}>{empty ? 'Chưa cập nhật' : children}</dd>
    </div>
  );
}
