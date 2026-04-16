export default function ProfileTypeBadge({ type }: { type: string }) {
  return (
    <span className="badge badge-info">
      {type}
    </span>
  );
}
