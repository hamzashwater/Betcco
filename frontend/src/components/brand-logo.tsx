import Image from "next/image";
import { defaultBrand } from "@/lib/brand";

type BrandLogoVariant = "horizontal" | "primary" | "dark" | "icon";

const logoVariants: Record<
  BrandLogoVariant,
  { src: string; width: number; height: number }
> = {
  horizontal: { src: defaultBrand.Logo, width: 1600, height: 500 },
  primary: { src: defaultBrand.PrimaryLogo, width: 1200, height: 900 },
  dark: { src: defaultBrand.DarkModeLogo, width: 1600, height: 500 },
  icon: { src: defaultBrand.Favicon, width: 512, height: 512 },
};

export function BrandLogo({
  variant = "horizontal",
  className,
  priority = false,
  src,
  alt,
}: {
  variant?: BrandLogoVariant;
  className?: string;
  priority?: boolean;
  src?: string;
  alt?: string;
}) {
  const logo = logoVariants[variant];

  return (
    <Image
      src={src ?? logo.src}
      alt={alt ?? defaultBrand.BrandName}
      width={logo.width}
      height={logo.height}
      priority={priority}
      className={`brand-logo ${className ?? ""}`}
    />
  );
}
