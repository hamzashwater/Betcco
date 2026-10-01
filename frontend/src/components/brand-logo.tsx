import Image from "next/image";
import type { CSSProperties } from "react";
import {
  resolveBrandDimensions,
  resolveBrandIdentity,
  type BrandAssetDimensions,
  type BrandAssetRole,
  type BrandIdentity,
} from "@/lib/brand";

type BrandLogoVariant = "horizontal" | "primary" | "dark" | "icon";

const defaultIdentity = resolveBrandIdentity("ar");
const logoRoles: Record<BrandLogoVariant, BrandAssetRole> = {
  horizontal: "wordmark",
  primary: "primary",
  dark: "onDark",
  icon: "mark",
};

export function BrandLogo({
  variant = "horizontal",
  className,
  priority = false,
  src,
  alt,
  identity = defaultIdentity,
  dimensions,
  maxBlockSize,
}: {
  variant?: BrandLogoVariant;
  className?: string;
  priority?: boolean;
  src?: string;
  alt?: string;
  identity?: BrandIdentity;
  dimensions?: BrandAssetDimensions;
  maxBlockSize?: CSSProperties["maxBlockSize"];
}) {
  const logo = identity.assets[logoRoles[variant]];
  const size = resolveBrandDimensions(
    dimensions ?? logo,
    defaultIdentity.assets[logoRoles[variant]],
  );
  const source = (src ?? logo.src).trim();
  const label = alt ?? identity.name;

  // An explicitly empty asset means a text identity, not a different brand's
  // default logo. An empty alt remains decorative, including this fallback.
  if (!source) {
    return (
      <span
        className={`brand-logo brand-logo-fallback ${className ?? ""}`}
        role={label ? "img" : undefined}
        aria-label={label || undefined}
        aria-hidden={!label || undefined}
      >
        {identity.name}
      </span>
    );
  }

  return (
    <Image
      src={source}
      alt={label}
      width={size.width}
      height={size.height}
      preload={priority}
      style={
        maxBlockSize === undefined
          ? undefined
          : { maxBlockSize, width: "auto", height: "auto" }
      }
      className={`brand-logo ${className ?? ""}`}
    />
  );
}
