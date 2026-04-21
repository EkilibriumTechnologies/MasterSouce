import { JsonLd } from "@/components/seo/json-ld";

type ArticleSchemaProps = {
  title: string;
  description: string;
  date: string;
  url: string;
};

export function ArticleSchema({ title, description, date, url }: ArticleSchemaProps) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description,
        author: {
          "@type": "Organization",
          name: "MasterSauce"
        },
        publisher: {
          "@type": "Organization",
          name: "MasterSauce",
          logo: {
            "@type": "ImageObject",
            url: "https://www.mastersauce.ai/logo.png"
          }
        },
        datePublished: date,
        dateModified: date,
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": url
        }
      }}
    />
  );
}
