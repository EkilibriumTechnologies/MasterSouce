import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import "./mastersauce-brand-header.css";

type MasterSauceBrandNavProps = {
  backHref?: string;
  backLabel?: string;
  trailing?: ReactNode;
};

export function MasterSauceBrandNav({
  backHref = "/",
  backLabel = "← Back to MasterSauce",
  trailing
}: MasterSauceBrandNavProps) {
  return (
    <nav className="mastersauce-brand-nav" aria-label="Site">
      <Link href="/" className="mastersauce-brand-nav__home">
        <Image
          src="/mastersauce-logo.png"
          alt="MasterSauce"
          width={466}
          height={381}
          priority
          className="mastersauce-brand-nav__logo"
          sizes="(max-width: 639px) 108px, 168px"
        />
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {trailing}
        {backHref ? (
          <Link href={backHref} className="mastersauce-brand-nav__back">
            {backLabel}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

type MasterSauceBrandHeroLogoProps = {
  priority?: boolean;
};

export function MasterSauceBrandHeroLogo({ priority = false }: MasterSauceBrandHeroLogoProps) {
  return (
    <Image
      src="/mastersauce-logo.png"
      alt="MasterSauce logo"
      width={466}
      height={381}
      priority={priority}
      className="mastersauce-brand-hero-logo"
      sizes="(max-width: 639px) 148px, 220px"
    />
  );
}
