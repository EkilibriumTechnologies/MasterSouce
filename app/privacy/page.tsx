export default function PrivacyPage() {
  return (
    <main style={mainStyle}>
      <h1 style={titleStyle}>Privacy Policy</h1>
      <p style={textStyle}>Last updated: March 26, 2026</p>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>1. Data we collect</h2>
        <p style={textStyle}>
          For this MVP, we process uploaded audio files, selected mastering options, and email addresses submitted to unlock downloads.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>2. How we use data</h2>
        <p style={textStyle}>
          We use uploaded data to process and return mastered audio, provide previews, and support product operations such as free-usage tracking.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>3. Metadata handling</h2>
        <p style={textStyle}>
          Metadata handling is limited to export normalization and privacy cleanup for output consistency.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>4. Ownership and responsibility</h2>
        <p style={textStyle}>
          You are responsible for having rights to uploaded content. MasterSauce acts as a processing tool and is not the rights owner of user material.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>5. Retention</h2>
        <p style={textStyle}>
          Temporary processing files are auto-cleaned after a short retention window as part of normal platform operation.
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
