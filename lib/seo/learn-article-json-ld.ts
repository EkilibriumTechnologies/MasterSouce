import { absoluteUrl, SITE_NAME } from "@/lib/site";

type LearnArticleJsonLdInput = {
  path: string;
  headline: string;
  description: string;
};

/**
 * Minimal Article JSON-LD for /learn guides (no FAQ duplication).
 */
export function getLearnArticleJsonLd({ path, headline, description }: LearnArticleJsonLdInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    url: absoluteUrl(path),
    inLanguage: "en-US",
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: absoluteUrl("/")
    }
  };
}
