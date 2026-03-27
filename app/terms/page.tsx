export default function TermsPage() {
  return (
    <main style={mainStyle}>
      <h1 style={titleStyle}>Terms of Service</h1>
      <p style={textStyle}>Last updated: March 26, 2026</p>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>1. Service scope</h2>
        <p style={textStyle}>
          MasterSouce provides automated audio processing and mastering assistance. It is a creator-focused processing tool, not a professional studio mastering suite.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>2. Rights to uploaded content</h2>
        <p style={textStyle}>
          You are solely responsible for ensuring you have all rights, licenses, and permissions required to upload and process any audio content through the service.
        </p>
        <p style={textStyle}>
          By using the service, you confirm that your uploads do not violate third-party rights.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>3. Ownership</h2>
        <p style={textStyle}>
          You retain ownership of your uploaded audio and resulting exports. MasterSouce does not claim ownership of user content.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>4. Metadata handling</h2>
        <p style={textStyle}>
          Any metadata handling is limited to export normalization and privacy cleanup for consistent file delivery.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>5. Availability and limits</h2>
        <p style={textStyle}>
          Free usage limits, feature availability, and pricing may change as the product evolves.
        </p>
      </section>
    </main>
  );
}

const mainStyle: React.CSSProperties = {
  maxWidth: "840px",
  margin: "0 auto",
  padding: "40px 20px 70px",
  color: "#e8ecff",
  display: "grid",
  gap: "16px"
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "2rem"
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #2a2f44",
  borderRadius: "14px",
  background: "#101420",
  padding: "16px"
};

const headingStyle: React.CSSProperties = {
  margin: "0 0 6px 0",
  fontSize: "1.1rem"
};

const textStyle: React.CSSProperties = {
  margin: "6px 0",
  color: "#b9c2e6",
  lineHeight: 1.5
};
