import { useNavigate, useRouterState } from "@tanstack/react-router";
type LogoSize = "sm" | "md" | "lg" | "xl";

const ICON_SIZES: Record<LogoSize, number> = { sm: 32, md: 64, lg: 120, xl: 180 };
const FULL_LOGO_SIZES: Record<LogoSize, number> = { sm: 52, md: 80, lg: 120, xl: 180 };
const FULL_LOGO_SRC = "/FindMit-Logo-Kente-Crisp-v2.png";
const ICON_SRC = "/FindMit-Icon-Transparent-FINAL.png";

export function FindMitLogo({
  size = "md",
  showText = true,
  className,
  linkToHome = true,
}: {
  size?: LogoSize;
  showText?: boolean;
  className?: string;
  linkToHome?: boolean;
}) {
  const px = showText ? FULL_LOGO_SIZES[size] : ICON_SIZES[size];
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const image = (
    <img
      src={showText ? FULL_LOGO_SRC : ICON_SRC}
      alt="FindMit"
      width={px}
      height={px}
      draggable={false}
      className={`block shrink-0 object-contain opacity-100 ${className ?? ""}`}
      style={{ width: px, height: px, borderRadius: 0, background: "transparent" }}
    />
  );

  if (!linkToHome) return image;

  // The logo is the home button; home is now Jobs (FindMit Ghana).
  const handleClick = () => {
    void navigate({ to: "/jobs", search: { tab: "ghana" } });
  };

  return (
    <button type="button" onClick={handleClick} aria-label="FindMit home" className="inline-flex items-center justify-center">
      {image}
    </button>
  );
}

export default FindMitLogo;
