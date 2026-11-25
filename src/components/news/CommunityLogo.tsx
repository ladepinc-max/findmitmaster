import { communityLogo } from "@/lib/community-news";

/** Faceted gem badge generated from the community's name. */
export function CommunityLogo({ name, size = 40 }: { name: string; size?: number }) {
  const { palette, rotation } = communityLogo(name);
  const [a, b, c, d] = palette;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0">
      <rect width="40" height="40" rx="9" fill={d} />
      <g transform={`rotate(${rotation} 20 20)`}>
        <polygon points="20,4 36,20 20,20" fill={b} />
        <polygon points="20,4 4,20 20,20" fill={a} />
        <polygon points="4,20 20,36 20,20" fill={c} />
        <polygon points="36,20 20,36 20,20" fill={a} opacity="0.85" />
        <polygon points="20,10 28,20 20,30 12,20" fill={b} opacity="0.55" />
      </g>
    </svg>
  );
}
