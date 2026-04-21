"use client";

type JsonLdClientProps = {
  data: Record<string, unknown>;
};

export function JsonLdClient({ data }: JsonLdClientProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c")
      }}
    />
  );
}
