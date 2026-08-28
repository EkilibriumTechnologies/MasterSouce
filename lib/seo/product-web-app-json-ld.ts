import { absoluteUrl, SITE_NAME } from "@/lib/site";

type ProductWebAppJsonLdInput = {
  name: string;
  description: string;
  path: string;
  featureList: readonly string[];
};

/**
 * Page + web-app graph for interactive MasterSauce tools.
 * Keep featureList limited to capabilities that are visible on the product page.
 */
export function getProductWebAppJsonLd({
  name,
  description,
  path,
  featureList
}: ProductWebAppJsonLdInput): Record<string, unknown>[] {
  const url = absoluteUrl(path);
  const organizationId = `${absoluteUrl("/")}#organization`;
  const websiteId = `${absoluteUrl("/")}#website`;
  const applicationId = `${url}#web-application`;

  return [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name,
      description,
      isPartOf: { "@id": websiteId },
      about: { "@id": applicationId }
    },
    {
      "@type": "WebApplication",
      "@id": applicationId,
      name,
      description,
      url,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      browserRequirements: "Requires a modern web browser",
      featureList: [...featureList],
      publisher: {
        "@type": "Organization",
        "@id": organizationId,
        name: SITE_NAME,
        url: absoluteUrl("/")
      }
    }
  ];
}
