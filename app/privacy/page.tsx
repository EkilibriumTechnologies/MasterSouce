import type { CSSProperties } from "react";
import Link from "next/link";

// TODO: Insert Privacy Contact Email before deploy
const PRIVACY_CONTACT_EMAIL = "consulting@ekilibriumtechnologies.com";

export default function PrivacyPage() {
  return (
    <main style={mainStyle}>
      <nav style={topNavStyle} aria-label="Site">
        <Link href="/" style={backLinkStyle}>
          ← Back to MasterSauce
        </Link>
      </nav>

      <h1 style={titleStyle}>Privacy Policy</h1>
      <p style={textStyle}>Last updated: March 30, 2026</p>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>1. What we collect</h2>
        <p style={textStyle}>We collect the following information when you use MasterSauce:</p>
        <ul style={listStyle}>
          <li>Audio files you upload for mastering (processed in-memory and never stored)</li>
          <li>Selected mastering options and genre settings</li>
          <li>
            Your email address, submitted when unlocking downloads, creating an account, or completing a purchase
          </li>
          <li>Basic usage data such as mastering session counts for free-tier tracking</li>
          <li>Standard technical data such as browser type and IP address for security and abuse prevention</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>2. How we use your email</h2>
        <p style={textStyle}>Your email address is used strictly for the following purposes:</p>
        <ul style={listStyle}>
          <li>To create and validate your MasterSauce account or subscription</li>
          <li>To process and confirm one-time payments</li>
          <li>To send you important updates about your account or purchase</li>
          <li>To notify you of new features, product updates, or promotional offers from MasterSauce</li>
        </ul>
        <p style={textStyle}>
          We do not sell, rent, or share your email address with third parties for their own marketing purposes.
        </p>
        <p style={textStyle}>
          You may opt out of promotional emails at any time by clicking the unsubscribe link in any email we send.
          Transactional emails related to your account or purchases are not subject to opt-out.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>3. How we use your audio files</h2>
        <p style={textStyle}>
          Uploaded audio files are processed solely to perform mastering, generate a preview, and deliver your mastered
          output. Processing uses temporary files on our server that are automatically deleted within 30 minutes of
          upload — with a hard cleanup of any remaining fragments at 35 minutes.
        </p>
        <p style={textStyle}>
          MasterSauce does not permanently store your audio. No files are written to long-term storage, databases, or
          cloud buckets at any point. Your audio never persists beyond the active processing window.
        </p>
        <p style={textStyle}>
          MasterSauce does not claim ownership of your audio, does not use it for training machine learning models, and
          does not share it with any third party.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>4. Metadata handling</h2>
        <p style={textStyle}>
          Metadata handling is limited to export normalization and privacy cleanup for output consistency. We do not
          read, store, or distribute embedded metadata from your audio files beyond what is technically necessary to
          process and return your output within the active session.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>5. File retention</h2>
        <p style={textStyle}>
          Audio files uploaded to MasterSauce are stored as temporary files on our server solely for the duration of
          processing. The retention timeline is as follows:
        </p>
        <ul style={listStyle}>
          <li>Uploaded and processed files expire automatically after 30 minutes</li>
          <li>Any remaining temporary fragments are force-deleted at 35 minutes</li>
          <li>No audio data is retained on our servers beyond this window under any circumstance</li>
        </ul>
        <p style={textStyle}>
          MasterSauce does not maintain a permanent copy of your original upload or your mastered output. You are solely
          responsible for downloading your mastered file before your session expires. We cannot recover files after they
          have been deleted.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>6. Data sharing</h2>
        <p style={textStyle}>
          We do not sell your personal data. We may share limited data with trusted infrastructure and payment providers
          (such as cloud hosting and Stripe) solely to operate the Service. These providers are contractually required
          to protect your data and may not use it for their own purposes.
        </p>
        <p style={textStyle}>Audio files are never shared with any third party under any circumstance.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>7. Cookies and tracking</h2>
        <p style={textStyle}>
          MasterSauce may use cookies or similar technologies for session management, free-usage tracking, and basic
          analytics. We do not use third-party advertising cookies or tracking pixels for ad targeting.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>8. Security</h2>
        <p style={textStyle}>
          We implement reasonable technical and organizational measures to protect your data. However, no system is
          completely secure. You use the Service at your own risk and are responsible for maintaining the security of
          your own account credentials.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>9. Your rights</h2>
        <p style={textStyle}>
          {/* TODO: Insert Privacy Contact Email before deploy (verify PRIVACY_CONTACT_EMAIL constant at top of file) */}
          Depending on your location, you may have the right to access, correct, or request deletion of your personal
          data. Because MasterSauce does not store audio files, there is no audio data to retrieve or delete after your
          session ends. For email or account data requests, contact us at:{" "}
          <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} style={linkStyle}>
            {PRIVACY_CONTACT_EMAIL}
          </a>
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>10. Changes to this policy</h2>
        <p style={textStyle}>
          We may update this Privacy Policy from time to time. If we make material changes, we will update the
          &quot;Last updated&quot; date at the top of this page. Continued use of the Service after changes constitutes
          your acceptance of the updated policy.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={headingStyle}>11. Contact</h2>
        <p style={textStyle}>
          {/* TODO: Insert Privacy Contact Email before deploy (verify PRIVACY_CONTACT_EMAIL constant at top of file) */}
          If you have questions about this Privacy Policy, contact us at:{" "}
          <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} style={linkStyle}>
            {PRIVACY_CONTACT_EMAIL}
          </a>
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

const topNavStyle: CSSProperties = {
  margin: "0 0 22px",
  padding: "0 2px"
};

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: "44px",
  padding: "8px 10px 8px 4px",
  marginLeft: "-4px",
  fontFamily: "inherit",
  fontSize: "0.92rem",
  fontWeight: 600,
  textDecoration: "none",
  letterSpacing: "0.01em",
  color: "rgba(142, 160, 208, 0.88)"
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

const listStyle: React.CSSProperties = {
  margin: "6px 0",
  paddingLeft: "1.25rem",
  color: "#b9c2e6",
  lineHeight: 1.5
};

const linkStyle: React.CSSProperties = {
  color: "#c8d4ff",
  textDecoration: "underline"
};
