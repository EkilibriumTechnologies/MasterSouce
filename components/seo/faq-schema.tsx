import { JsonLd } from "@/components/seo/json-ld";

export type FaqItem = {
  question: string;
  answer: string;
};

type FAQSchemaProps = {
  title: string;
  description: string;
  date: string;
  url: string;
  faq?: FaqItem[];
};

export function FAQSchema({ faq }: FAQSchemaProps) {
  if (!faq?.length) return null;

  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer
          }
        }))
      }}
    />
  );
}
