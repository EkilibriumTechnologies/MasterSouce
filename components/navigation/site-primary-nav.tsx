"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import "./site-primary-nav.css";

const links = [
  { href: "/learn", label: "Learn" },
  { href: "/song-architect", label: "Song Architect" },
  { href: "/ar-ai", label: "Hit Analyzer" },
  { href: "/projects", label: "Journeys" },
  { href: "/#pricing", label: "Pricing" }
] as const;

type SitePrimaryNavProps = {
  trailing?: ReactNode;
};

export function SitePrimaryNav({ trailing }: SitePrimaryNavProps) {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !navRef.current?.contains(event.target)) setOpen(false);
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    }

    function onWideViewport(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }

    const wideScreen = window.matchMedia("(min-width: 768px)");
    document.addEventListener("pointerdown", onOutsideClick);
    document.addEventListener("keydown", onEscape);
    wideScreen.addEventListener("change", onWideViewport);

    return () => {
      document.removeEventListener("pointerdown", onOutsideClick);
      document.removeEventListener("keydown", onEscape);
      wideScreen.removeEventListener("change", onWideViewport);
    };
  }, [open]);

  return (
    <nav ref={navRef} className="ms-primary-nav" aria-label="Primary">
      <Link href="/" className="ms-primary-nav__brand" onClick={() => setOpen(false)}>
        <span className="ms-primary-nav__mark" aria-hidden="true">♫</span>
        <span>MasterSauce</span>
      </Link>

      <div className="ms-primary-nav__actions">
        {trailing ? <div className="ms-primary-nav__trailing">{trailing}</div> : null}
        <button
          ref={menuButtonRef}
          type="button"
          className="ms-primary-nav__toggle"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls="ms-primary-nav-links"
          onClick={() => setOpen((current) => !current)}
        >
          <span>Menu</span>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
            {open ? (
              <path d="M5 5L19 19M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      <div id="ms-primary-nav-links" className={`ms-primary-nav__links${open ? " ms-primary-nav__links--open" : ""}`}>
        {links.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
            {item.label}
          </Link>
        ))}
        <Link href="/#master" className="ms-primary-nav__mobile-cta" onClick={() => setOpen(false)}>
          Master a song
        </Link>
        {trailing ? <div className="ms-primary-nav__mobile-trailing">{trailing}</div> : null}
      </div>
    </nav>
  );
}
