import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

import { HOME_FAQ_ITEMS } from "./home-faq";

const ORG_ID = `${absoluteUrl("/")}#organization`;
const WEBSITE_ID = `${absoluteUrl("/")}#website`;
const SOFTWARE_ID = `${absoluteUrl("/")}#software`;

export function getHomePageJsonLdGraph(): Record<string, unknown>[] {
  const base = absoluteUrl("/");

  const organization: Record<string, unknown> = {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: base,
    description: SITE_DESCRIPTION,
    logo: absoluteUrl("/mastersauce-logo.png")
  };

  const website: Record<string, unknown> = {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: base,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    publisher: { "@id": ORG_ID }
  };

  const software: Record<string, unknown> = {
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    name: SITE_NAME,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    url: base,
    description: `${SITE_NAME} — ${SITE_TAGLINE}. ${SITE_DESCRIPTION}`,
    publisher: { "@id": ORG_ID }
  };

  const faq: Record<string, unknown> = {
    "@type": "FAQPage",
    mainEntity: HOME_FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };

  return [organization, website, software, faq];
}
