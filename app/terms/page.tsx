import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";

import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { LEGAL_CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Terms & Conditions",
  description:
    "Terms of use for MasterSauce: rights to your audio, acceptable use, subscriptions, disclaimers, and how to contact us.",
  path: "/terms"
});

export default function TermsPage() {
  return (
    <main style={mainStyle}>
      <nav style={topNavStyle} aria-label="Site">
        <Link href="/" style={backLinkStyle}>
          ← Back to MasterSauce
        </Link>
      </nav>

      <header style={headerBlockStyle}>
        <h1 style={h1Style}>Terms & Conditions</h1>
        <p style={subtitleStyle}>
          Please read these Terms & Conditions carefully before using MasterSauce.
        </p>
        <p style={effectiveDateStyle}>Effective Date: March 30, 2026</p>
      </header>

      <div style={sectionsWrapStyle}>
        <p style={pStyle}>
          Welcome to MasterSauce. These Terms & Conditions (&quot;Terms&quot;) govern your access to and use of the
          MasterSauce website, products, and services (collectively, the &quot;Service&quot;). By accessing or using the
          Service, you agree to be bound by these Terms. If you do not agree to these Terms, do not use the Service.
        </p>

        <hr style={dividerStyle} />

        <section style={sectionStyle}>
          <h2 style={h2Style}>1. About MasterSauce</h2>
          <p style={pStyle}>
            MasterSauce is an online audio mastering service that allows users to upload audio files, process them
            through automated mastering workflows, preview results, and download mastered outputs.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>2. Eligibility</h2>
          <p style={pStyle}>
            You may use the Service only if you are legally able to enter into a binding agreement. By using the Service,
            you represent and warrant that you meet this requirement. If you are using the Service on behalf of a business
            or other entity, you represent and warrant that you have authority to bind that entity to these Terms.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>3. Acceptance of Terms</h2>
          <p style={pStyle}>
            By accessing, browsing, uploading content to, or otherwise using the Service, you agree to these Terms and to
            any additional policies or guidelines that may be posted on the website from time to time.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>4. User Content and Ownership</h2>
          <p style={pStyle}>
            You retain all ownership rights in and to the audio files, recordings, tracks, stems, mixes, metadata, and
            other content that you upload or submit through the Service (&quot;User Content&quot;).
          </p>
          <p style={pStyle}>MasterSauce does not claim ownership of your User Content.</p>
          <p style={pStyle}>You represent and warrant that:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>
              you own, control, or have obtained all rights, licenses, consents, and permissions necessary to upload,
              process, and use your User Content through the Service;
            </li>
            <li style={liStyle}>
              your User Content does not infringe, misappropriate, or violate any copyright, trademark, privacy,
              publicity, contract, or other rights of any third party; and
            </li>
            <li style={liStyle}>your use of the Service complies with all applicable laws and regulations.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>5. Limited License to Process Content</h2>
          <p style={pStyle}>
            Solely for the purpose of operating the Service, you grant MasterSauce a limited, non-exclusive, revocable,
            worldwide license to receive, host, process, analyze, reproduce, transform, transmit, and make available your
            User Content as technically necessary to:
          </p>
          <ul style={ulStyle}>
            <li style={liStyle}>perform audio mastering;</li>
            <li style={liStyle}>generate previews and outputs;</li>
            <li style={liStyle}>deliver mastered files back to you;</li>
            <li style={liStyle}>maintain service security, integrity, and abuse prevention; and</li>
            <li style={liStyle}>support limited operational, technical, or compliance-related needs.</li>
          </ul>
          <p style={pStyle}>
            This license is granted only for the purpose of providing and improving the Service and does not transfer
            ownership of your User Content to MasterSauce.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>6. Temporary Processing and File Retention</h2>
          <p style={pStyle}>
            MasterSauce is designed as a temporary audio processing service. Uploaded tracks are intended to be processed
            for mastering, preview, and delivery, and are not intended to be permanently stored as a user media library.
          </p>
          <p style={pStyle}>
            However, MasterSauce may retain files, logs, metadata, or related technical records for a limited period where
            reasonably necessary for:
          </p>
          <ul style={ulStyle}>
            <li style={liStyle}>processing and delivering the requested output;</li>
            <li style={liStyle}>debugging, troubleshooting, and quality assurance;</li>
            <li style={liStyle}>fraud prevention, abuse detection, and security monitoring;</li>
            <li style={liStyle}>legal compliance; or</li>
            <li style={liStyle}>maintaining basic operational records.</li>
          </ul>
          <p style={pStyle}>
            MasterSauce does not guarantee that any uploaded or processed file will remain available for any specific
            period of time. Users are responsible for maintaining their own backup copies of all original and mastered
            files.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>7. Prohibited Uses</h2>
          <p style={pStyle}>You agree not to:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>upload content that you do not have the legal right to use;</li>
            <li style={liStyle}>
              upload unlawful, infringing, defamatory, abusive, fraudulent, deceptive, harmful, or malicious content;
            </li>
            <li style={liStyle}>use the Service to violate the rights of any person or entity;</li>
            <li style={liStyle}>interfere with, disrupt, damage, or overload the Service or its infrastructure;</li>
            <li style={liStyle}>attempt to gain unauthorized access to any system, account, server, or data;</li>
            <li style={liStyle}>
              reverse engineer, scrape, copy, reproduce, resell, exploit, or misuse any part of the Service except as
              expressly permitted by law;
            </li>
            <li style={liStyle}>
              use bots, scripts, automation, or other methods to abuse or excessively burden the Service;
            </li>
            <li style={liStyle}>upload viruses, malware, or other harmful code.</li>
          </ul>
          <p style={pStyle}>
            MasterSauce reserves the right to suspend, limit, or terminate access to the Service for any user who
            violates these Terms or uses the Service in a harmful or abusive manner.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>8. Service Availability and Changes</h2>
          <p style={pStyle}>
            MasterSauce may modify, suspend, restrict, or discontinue all or any part of the Service at any time, with or
            without notice.
          </p>
          <p style={pStyle}>
            We do not guarantee that the Service will be uninterrupted, secure, error-free, or available at all times.
            Features may change over time, including during beta or pre-release stages.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>9. Audio Output Disclaimer</h2>
          <p style={pStyle}>
            MasterSauce provides automated audio mastering results based on software-driven processing. Output quality and
            characteristics may vary depending on the source material, mix quality, genre, dynamics, loudness, and other
            factors.
          </p>
          <p style={pStyle}>You acknowledge and agree that:</p>
          <ul style={ulStyle}>
            <li style={liStyle}>the Service does not guarantee any particular sonic result;</li>
            <li style={liStyle}>
              outputs may not satisfy every creative, technical, commercial, or platform-specific expectation; and
            </li>
            <li style={liStyle}>you are solely responsible for reviewing and deciding whether to use any mastered output.</li>
          </ul>
          <p style={pStyle}>
            MasterSauce is a creative and technical tool, not a substitute for your own artistic, engineering, legal, or
            business judgment.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>10. Beta Features and Future Paid Services</h2>
          <p style={pStyle}>
            Some parts of the Service may be offered as beta, free, limited, experimental, or invite-only features. Such
            features may be changed, restricted, or removed at any time without notice.
          </p>
          <p style={pStyle}>
            MasterSauce may in the future introduce paid plans, subscriptions, usage caps, credits, download limits,
            premium features, or other billing structures. If paid features are introduced, additional billing or
            subscription terms may apply.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>11. Fees and Refunds</h2>
          <p style={pStyle}>
            If MasterSauce offers paid services now or in the future, you agree to pay all applicable fees, charges,
            taxes, and related amounts disclosed at the time of purchase.
          </p>
          <p style={pStyle}>
            Unless otherwise stated in writing, all fees are non-refundable except where required by applicable law.
            MasterSauce reserves the right to change pricing at any time, subject to applicable notice requirements where
            required.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>12. Intellectual Property</h2>
          <p style={pStyle}>
            The Service, including its software, code, design, interface, branding, trademarks, logos, workflows,
            graphics, text, and all related materials, is owned by or licensed to MasterSauce and is protected by
            intellectual property and other applicable laws.
          </p>
          <p style={pStyle}>
            Except for the limited rights expressly granted in these Terms, no rights, title, or interest in the Service
            or its intellectual property are transferred to you.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>13. Feedback</h2>
          <p style={pStyle}>
            If you submit suggestions, feedback, ideas, or recommendations regarding MasterSauce (&quot;Feedback&quot;),
            you grant MasterSauce a non-exclusive, worldwide, perpetual, irrevocable, royalty-free right to use,
            reproduce, modify, adapt, publish, and otherwise exploit that Feedback for any lawful purpose, without
            compensation or attribution to you.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>14. Copyright Complaints</h2>
          <p style={pStyle}>
            MasterSauce respects intellectual property rights and expects users to do the same.
          </p>
          <p style={pStyle}>
            If you believe that content submitted through the Service infringes your copyright or other intellectual
            property rights, you may submit a notice to:{" "}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={inlineLinkStyle}>
              {LEGAL_CONTACT_EMAIL}
            </a>
          </p>
          <p style={pStyle}>
            Your notice should include sufficient information to identify the allegedly infringing material, your contact
            details, a description of your claim, and any supporting information reasonably necessary for us to review the
            complaint.
          </p>
          <p style={pStyle}>
            MasterSauce reserves the right to remove allegedly infringing content, suspend access, or terminate repeat
            infringers where appropriate.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>15. Privacy</h2>
          <p style={pStyle}>
            Your use of the Service may also be governed by our Privacy Policy. To the extent a Privacy Policy is
            published on the website, it is incorporated into these Terms by reference.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>16. Disclaimer of Warranties</h2>
          <p style={capsBlockStyle}>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE,&quot;
            WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE.
          </p>
          <p style={capsBlockStyle}>
            MASTERSAUCE DISCLAIMS ALL WARRANTIES, INCLUDING ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, QUIET ENJOYMENT, ACCURACY, AVAILABILITY, OR ERROR-FREE
            OPERATION.
          </p>
          <p style={capsBlockStyle}>MASTERSAUCE DOES NOT WARRANT THAT:</p>
          <ul style={ulStyleCaps}>
            <li style={liStyle}>THE SERVICE WILL MEET YOUR REQUIREMENTS;</li>
            <li style={liStyle}>THE SERVICE WILL BE AVAILABLE AT ANY PARTICULAR TIME OR LOCATION;</li>
            <li style={liStyle}>THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE; OR</li>
            <li style={liStyle}>ANY FILES, OUTPUTS, OR DATA WILL NOT BE LOST, CORRUPTED, OR ALTERED.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>17. Limitation of Liability</h2>
          <p style={capsBlockStyle}>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, MASTERSAUCE AND ITS OWNERS, AFFILIATES, OFFICERS, EMPLOYEES,
            CONTRACTORS, LICENSORS, AND SERVICE PROVIDERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, BUSINESS
            INTERRUPTION, OR LOSS OF CONTENT, ARISING OUT OF OR RELATED TO YOUR USE OF OR INABILITY TO USE THE SERVICE.
          </p>
          <p style={capsBlockStyle}>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE TOTAL AGGREGATE LIABILITY OF MASTERSAUCE FOR ANY CLAIMS ARISING OUT
            OF OR RELATED TO THE SERVICE OR THESE TERMS SHALL NOT EXCEED THE GREATER OF: (a) THE AMOUNT YOU PAID TO
            MASTERSAUCE FOR THE SERVICE IN THE THREE (3) MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM; OR (b) FIFTY U.S.
            DOLLARS (USD $50).
          </p>
          <p style={capsBlockStyle}>
            SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS OF LIABILITY, SO SOME OF THE ABOVE MAY NOT APPLY TO YOU.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>18. Indemnification</h2>
          <p style={pStyle}>
            You agree to defend, indemnify, and hold harmless MasterSauce and its owners, affiliates, officers, employees,
            contractors, licensors, and service providers from and against any claims, liabilities, damages, judgments,
            awards, losses, costs, expenses, or fees (including reasonable attorneys&apos; fees) arising out of or relating
            to: your use of the Service; your User Content; your violation of these Terms; your violation of any
            applicable law or regulation; or your violation of the rights of any third party.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>19. Governing Law and Disputes</h2>
          <p style={pStyle}>
            These Terms shall be governed by and construed in accordance with the laws of the State of Texas, without regard
            to its conflict of law principles.
          </p>
          <p style={pStyle}>
            Any dispute arising out of or relating to these Terms or the Service that cannot be resolved informally shall be
            brought exclusively in the state or federal courts located in Texas, and you consent to the personal
            jurisdiction and venue of such courts.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>20. Changes to These Terms</h2>
          <p style={pStyle}>
            MasterSauce may update or revise these Terms at any time. If we make material changes, we will update the
            Effective Date at the top of this page. Your continued use of the Service after any changes constitutes your
            acceptance of the updated Terms.
          </p>
          <p style={pStyle}>We encourage you to review these Terms periodically.</p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>21. Contact</h2>
          <p style={pStyle}>If you have questions about these Terms, you may contact us at:</p>
          <p style={pStyle}>
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={inlineLinkStyle}>
              {LEGAL_CONTACT_EMAIL}
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}

const mainStyle: CSSProperties = {
  maxWidth: "760px",
  margin: "0 auto",
  padding: "28px clamp(20px, 4vw, 36px) 72px",
  color: "#eef2ff",
  fontFamily: "inherit",
  boxSizing: "border-box"
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

const headerBlockStyle: CSSProperties = {
  marginBottom: "36px"
};

const h1Style: CSSProperties = {
  margin: "0 0 14px",
  fontSize: "clamp(1.75rem, 4vw, 2.125rem)",
  fontWeight: 700,
  color: "#f1f4ff",
  letterSpacing: "-0.02em",
  lineHeight: 1.2
};

const subtitleStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "1.05rem",
  lineHeight: 1.75,
  color: "#b4c3ec",
  maxWidth: "52ch"
};

const effectiveDateStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  lineHeight: 1.5,
  color: "#8794bc"
};

const sectionsWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "32px"
};

const sectionStyle: CSSProperties = {
  margin: 0
};

const dividerStyle: CSSProperties = {
  border: "none",
  borderTop: "1px solid rgba(66, 78, 120, 0.35)",
  margin: "4px 0 0"
};

const h2Style: CSSProperties = {
  margin: "0 0 12px",
  fontSize: "1.125rem",
  fontWeight: 700,
  color: "#e8edff",
  lineHeight: 1.35
};

const pStyle: CSSProperties = {
  margin: "0 0 14px",
  fontSize: "1rem",
  lineHeight: 1.75,
  color: "#c5cee8"
};

const ulStyle: CSSProperties = {
  margin: "0 0 14px",
  paddingLeft: "1.25rem",
  listStyleType: "disc",
  listStylePosition: "outside",
  color: "#c5cee8"
};

const ulStyleCaps: CSSProperties = {
  ...ulStyle,
  fontSize: "0.8125rem",
  lineHeight: 1.65,
  letterSpacing: "0.02em",
  color: "#aeb8d4"
};

const liStyle: CSSProperties = {
  marginBottom: "10px",
  paddingLeft: "4px"
};

const capsBlockStyle: CSSProperties = {
  margin: "0 0 14px",
  fontSize: "0.8125rem",
  lineHeight: 1.65,
  letterSpacing: "0.03em",
  color: "#aeb8d4",
  fontWeight: 600
};

const inlineLinkStyle: CSSProperties = {
  color: "#a8b8f0",
  textDecoration: "underline",
  textUnderlineOffset: "3px"
};
