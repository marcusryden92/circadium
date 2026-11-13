import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { themeLight } from "@/lib/theme";
import {
  page,
  nav,
  navLink,
  wordmark,
  container,
  title,
  updated,
  lead,
  section,
  heading,
  body,
  list,
  callout,
  calloutHeading,
  link,
  footer,
} from "./privacy.css";

export const metadata: Metadata = {
  title: "Privacy Policy — Circadium",
  description:
    "How Circadium handles your data, including read-only access to your Google Calendar.",
};

const CONTACT_EMAIL = "support@circadium.app";
const LAST_UPDATED = "August 6, 2026";
// The person or company legally responsible for the data (GDPR "controller").
// Replace with your registered name / company before a public launch.
const CONTROLLER_NAME = "[Your name or company]";
const CONTROLLER_COUNTRY = "Sweden";

export default function PrivacyPage() {
  return (
    <main className={`${themeLight} ${page} custom-scrollbar`}>
      <nav className={nav}>
        <Link href="/" className={wordmark} aria-label="Circadium home">
          <Logo size={19} />
        </Link>
        <Link href="/" className={navLink}>
          Back to home
        </Link>
      </nav>

      <div className={container}>
        <h1 className={title}>Privacy Policy</h1>
        <p className={updated}>Last updated: {LAST_UPDATED}</p>

        <p className={lead}>
          Circadium is a personal scheduling app. It takes your goals, tasks,
          and commitments and produces a placed weekly calendar. This policy
          explains what data we collect, how we use it, and — specifically — how
          we handle data accessed through Google APIs.
        </p>

        <section className={section}>
          <h2 className={heading}>Who we are</h2>
          <p className={body}>
            The data controller responsible for your personal data is{" "}
            {CONTROLLER_NAME}, based in {CONTROLLER_COUNTRY}. You can reach us
            about any privacy matter at{" "}
            <a className={link} href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>

        <section className={section}>
          <h2 className={heading}>Data we collect</h2>
          <p className={body}>
            When you use Circadium we store the information you create in the
            app: your tasks, goals, plans, categories, locations, weekly
            templates, and scheduling preferences. To sign you in we store your
            account details (email address and, if you register with a password,
            a securely hashed password). If you sign in with a third-party
            provider such as Google or GitHub, we receive your basic profile
            information from that provider.
          </p>
        </section>

        <section className={section}>
          <h2 className={heading}>Google Calendar data</h2>
          <p className={body}>
            If you choose to connect your Google account, Circadium requests
            read-only access to your Google Calendar using the{" "}
            <code>https://www.googleapis.com/auth/calendar.readonly</code> scope.
            We request the narrowest scope that supports the feature: we can
            read your calendar events, and we can never create, edit, or delete
            them.
          </p>
          <p className={body}>We use this access for a single purpose:</p>
          <ul className={list}>
            <li>
              To display your existing Google Calendar events inside Circadium.
            </li>
            <li>
              To treat those events as busy time, so the scheduling engine plans
              your tasks and goals around commitments you already have.
            </li>
          </ul>
          <p className={body}>
            You can disconnect your Google account at any time from Circadium&apos;s
            settings, which revokes our access and removes the imported event
            data from your account.
          </p>
          <p className={body}>
            Calendar events can sometimes reveal sensitive details (for example,
            a medical appointment). Circadium treats every event purely as busy
            time to schedule around — we do not read into, categorize, or infer
            anything from the content of your events.
          </p>
        </section>

        <div className={callout}>
          <h3 className={calloutHeading}>Limited Use disclosure</h3>
          <p className={body}>
            Circadium&apos;s use and transfer of information received from Google
            APIs to any other app will adhere to the{" "}
            <a
              className={link}
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <p className={body} style={{ marginBottom: 0 }}>
            We do not sell your Google user data. We do not share or transfer it
            to third parties except as necessary to provide the scheduling
            feature to you. We do not use it for advertising, and no humans read
            your calendar data except where required for security, to comply
            with the law, or with your explicit consent.
          </p>
        </div>

        <section className={section}>
          <h2 className={heading}>Legal basis for processing</h2>
          <p className={body}>
            Under the GDPR, we process your data on these bases:
          </p>
          <ul className={list}>
            <li>
              <strong>Performance of a contract</strong> — to provide the
              Circadium service you signed up for: storing your tasks, goals,
              and preferences, and generating your schedule.
            </li>
            <li>
              <strong>Consent</strong> — for optional features you switch on,
              such as connecting your Google Calendar or using the AI assistant.
              You can withdraw consent at any time by disconnecting the
              integration or removing the key.
            </li>
            <li>
              <strong>Legitimate interests</strong> — to keep the service
              secure and working, provided this does not override your rights.
            </li>
          </ul>
        </section>

        <section className={section}>
          <h2 className={heading}>How your data is stored and protected</h2>
          <p className={body}>
            Your data is stored in a hosted PostgreSQL database and is scoped to
            your account — every request is authenticated and access is limited
            to your own records. Your Anthropic API key, if you use the optional
            AI assistant, never reaches our servers: it is encrypted and stored
            only on your device. Access to Google Calendar data is protected by
            the same account-scoping and is never exposed to other users.
          </p>
        </section>

        <section className={section}>
          <h2 className={heading}>Analytics</h2>
          <p className={body}>
            We use PostHog, hosted in the European Union, to understand how
            Circadium is used and to improve it — for example which features are
            used and where people get stuck. Our analytics is cookieless: it
            stores nothing on your device (no cookies, no local storage, no
            persistent identifiers), which is why Circadium shows no cookie
            banner. When you are signed in, analytics events are linked to your
            account id so we can understand usage across visits.
          </p>
          <p className={body}>
            We may also record how the app&apos;s interface is used (session
            replay) to diagnose problems and improve usability. Everything you
            type is masked in these recordings before it leaves your browser.
            Analytics data is used solely to improve the product — never for
            advertising, and never sold or shared beyond the provider that
            processes it for us. We process this data on the basis of our
            legitimate interest in improving the service.
          </p>
        </section>

        <section className={section}>
          <h2 className={heading}>Service providers we use</h2>
          <p className={body}>
            We do not sell your personal data or your Google user data. We share
            data only with the infrastructure providers (sub-processors) that
            run Circadium, strictly to operate the app and only as required by
            law:
          </p>
          <ul className={list}>
            <li>Hosting and application delivery (Vercel).</li>
            <li>Database storage (Neon).</li>
            <li>Transactional email, e.g. sign-in and verification (Resend).</li>
            <li>
              Product analytics and session replay (PostHog, hosted in the EU).
            </li>
            <li>
              Sign-in providers you choose to use (Google, GitHub) and Google
              Calendar, when you connect them.
            </li>
            <li>
              The AI assistant, which is optional and runs on your own API key:
              when you use it, the goals and tasks it works on are sent from your
              browser directly to Anthropic to generate a response.
            </li>
          </ul>
        </section>

        <section className={section}>
          <h2 className={heading}>International data transfers</h2>
          <p className={body}>
            Some of our service providers are located outside the European
            Economic Area, including in the United States. Where your data is
            transferred outside the EEA, we rely on appropriate safeguards — such
            as the EU&ndash;U.S. Data Privacy Framework or the European
            Commission&apos;s Standard Contractual Clauses — to ensure it
            receives an equivalent level of protection.
          </p>
        </section>

        <section className={section}>
          <h2 className={heading}>Retention and deletion</h2>
          <p className={body}>
            We keep your data for as long as your account exists. You can delete
            your account from Circadium&apos;s settings at any time; doing so
            permanently removes your data, including any imported Google Calendar
            events. Disconnecting your Google account removes the imported
            calendar data without deleting the rest of your account.
          </p>
        </section>

        <section className={section}>
          <h2 className={heading}>Your rights</h2>
          <p className={body}>
            If you are in the EU/EEA, the GDPR gives you the following rights
            over your personal data, which you can exercise in the app or by
            contacting us:
          </p>
          <ul className={list}>
            <li>
              <strong>Access</strong> — get a copy of the data we hold about you
              (Settings → Data &amp; export).
            </li>
            <li>
              <strong>Rectification</strong> — correct inaccurate data by editing
              it in the app.
            </li>
            <li>
              <strong>Erasure</strong> — delete your account and all associated
              data (Settings → Danger zone).
            </li>
            <li>
              <strong>Portability</strong> — export your data in a machine-
              readable JSON format (Settings → Data &amp; export).
            </li>
            <li>
              <strong>Restriction and objection</strong> — ask us to limit or
              stop certain processing.
            </li>
            <li>
              <strong>Withdraw consent</strong> — for anything based on consent,
              such as disconnecting your Google account.
            </li>
          </ul>
          <p className={body}>
            You also have the right to lodge a complaint with your data-
            protection authority. In Sweden this is the Swedish Authority for
            Privacy Protection (IMY,{" "}
            <a
              className={link}
              href="https://www.imy.se"
              target="_blank"
              rel="noopener noreferrer"
            >
              imy.se
            </a>
            ).
          </p>
        </section>

        <section className={section}>
          <h2 className={heading}>Changes to this policy</h2>
          <p className={body}>
            We may update this policy from time to time. When we do, we will
            revise the &quot;Last updated&quot; date above. Material changes will
            be communicated in the app.
          </p>
        </section>

        <section className={section}>
          <h2 className={heading}>Contact</h2>
          <p className={body}>
            Questions about this policy or your data? Contact us at{" "}
            <a className={link} href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>

      <footer className={footer}>
        <span>© {new Date().getFullYear()} Circadium</span>
        <Link href="/" className={navLink}>
          circadium
        </Link>
      </footer>
    </main>
  );
}
