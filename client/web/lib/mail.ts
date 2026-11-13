import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const domain = process.env.NEXT_PUBLIC_APP_URL;

// Palette pulled from themeLight so mail visually matches the Circadium UI.
// Custom variables and rgba() are collapsed to hex/opaque values — email
// clients don't respect CSS custom properties and Outlook drops rgba on
// most surfaces.
const palette = {
  paper: "#f2efea",
  ink: "#16142a",
  inkSoft: "#3c3a52",
  muted: "#7a7890",
  card: "#ffffff",
  rule: "#eae5de",
  cardStroke: "#e2ded7",
  accent: "#3b82f6",
} as const;

// Custom fonts get declared first; realistically most clients drop them and
// fall back to the system stack. Both fallbacks are modern sans-serifs so
// there's no jarring shift.
const fontDisplay =
  "'Clash Display', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const fontUI =
  "'Hubot Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

interface EmailCta {
  label: string;
  href: string;
}

interface RenderEmailOptions {
  preheader: string;
  eyebrow: string;
  heading: string;
  bodyHtml: string;
  cta?: EmailCta;
}

/**
 * Builds a Circadium-branded HTML email. Uses table-based layout for Outlook
 * compatibility, inlines every style so Gmail's <style> stripping doesn't
 * flatten the design, and hides a preheader string for inbox preview text.
 */
const renderEmail = ({
  preheader,
  eyebrow,
  heading,
  bodyHtml,
  cta,
}: RenderEmailOptions) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Circadium</title>
</head>
<body style="margin:0;padding:0;background:${palette.paper};font-family:${fontUI};color:${palette.inkSoft};-webkit-font-smoothing:antialiased;">
<div style="display:none;font-size:1px;color:${palette.paper};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
${preheader}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${palette.paper};padding:40px 16px;">
<tr>
<td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${palette.card};border-radius:16px;border:1px solid ${palette.cardStroke};overflow:hidden;">
<tr>
<td style="padding:32px 40px 22px;">
<div style="font-family:${fontDisplay};font-size:22px;font-weight:500;letter-spacing:-0.03em;color:${palette.ink};line-height:1;">Circadium</div>
<div style="font-family:${fontUI};font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${palette.muted};margin-top:8px;">${eyebrow}</div>
</td>
</tr>
<tr>
<td style="padding:0 40px;">
<div style="height:1px;background:${palette.rule};line-height:1px;font-size:0;">&nbsp;</div>
</td>
</tr>
<tr>
<td style="padding:26px 40px 32px;">
<h1 style="margin:0 0 14px;font-family:${fontDisplay};font-size:26px;font-weight:500;letter-spacing:-0.025em;color:${palette.ink};line-height:1.15;">${heading}</h1>
<div style="font-family:${fontUI};font-size:14.5px;line-height:1.6;color:${palette.inkSoft};">${bodyHtml}</div>
${
  cta
    ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
<tr>
<td style="background:${palette.ink};border-radius:999px;">
<a href="${cta.href}" style="display:inline-block;padding:12px 22px;font-family:${fontUI};font-size:13px;font-weight:600;letter-spacing:0.01em;color:${palette.paper};text-decoration:none;">${cta.label}</a>
</td>
</tr>
</table>
`
    : ""
}
</td>
</tr>
<tr>
<td style="padding:0 40px;">
<div style="height:1px;background:${palette.rule};line-height:1px;font-size:0;">&nbsp;</div>
</td>
</tr>
<tr>
<td style="padding:18px 40px 26px;text-align:center;">
<div style="font-family:${fontUI};font-size:11px;color:${palette.muted};line-height:1.5;letter-spacing:0.02em;">The Circadium Team</div>
</td>
</tr>
</table>
<div style="font-family:${fontUI};font-size:10.5px;color:${palette.muted};margin-top:16px;letter-spacing:0.04em;">circadium.app</div>
</td>
</tr>
</table>
</body>
</html>
`;

export const sendTwoFactorTokenEmail = async (email: string, token: string) => {
  const html = renderEmail({
    preheader: "Your Circadium two-factor code",
    eyebrow: "Security",
    heading: "Your two-factor code",
    bodyHtml: `
<p style="margin:0 0 16px;">Use the code below to finish signing in. It expires in 5 minutes.</p>
<div style="margin:12px 0 4px;padding:18px 20px;background:${palette.paper};border:1px solid ${palette.cardStroke};border-radius:12px;text-align:center;">
<span style="font-family:${fontDisplay};font-size:30px;font-weight:600;letter-spacing:0.32em;color:${palette.ink};">${token}</span>
</div>
<p style="margin:20px 0 0;font-size:13px;color:${palette.muted};">If you didn&rsquo;t try to sign in, you can ignore this email.</p>
`,
  });

  await resend.emails.send({
    from: "security@circadium.app",
    to: email,
    subject: "Your Circadium two-factor code",
    html,
  });
};

export const sendVerificationEmail = async (email: string, token: string) => {
  const confirmationLink = `${domain}/auth/new-verification?token=${token}`;
  const html = renderEmail({
    preheader: "Verify your email to finish signing up for Circadium",
    eyebrow: "Verify email",
    heading: "Confirm your email",
    bodyHtml: `
<p style="margin:0 0 12px;">Welcome to Circadium. Confirm this email address to activate your account.</p>
<p style="margin:0;font-size:13px;color:${palette.muted};">If you didn&rsquo;t create an account, you can ignore this email.</p>
`,
    cta: { label: "Verify email", href: confirmationLink },
  });

  await resend.emails.send({
    from: "support@circadium.app",
    to: email,
    subject: "Confirm your email",
    html,
  });
};

export const sendAccountDeletionEmail = async (
  email: string,
  token: string,
) => {
  const confirmationLink = `${domain}/auth/confirm-deletion?token=${token}`;
  const html = renderEmail({
    preheader: "Confirm permanent Circadium account deletion",
    eyebrow: "Account deletion",
    heading: "Confirm account deletion",
    bodyHtml: `
<p style="margin:0 0 12px;">You asked to permanently delete your Circadium account. This will erase every planner, category, location, template, and calendar event tied to it. There is no undo.</p>
<p style="margin:0 0 12px;">If you want to proceed, confirm below within <strong>30 minutes</strong>.</p>
<p style="margin:0;font-size:13px;color:${palette.muted};">If you didn&rsquo;t request this, ignore this email — your account will stay untouched.</p>
`,
    cta: { label: "Confirm deletion", href: confirmationLink },
  });

  await resend.emails.send({
    from: "security@circadium.app",
    to: email,
    subject: "Confirm account deletion",
    html,
  });
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const sendFeedbackEmail = async ({
  reportId,
  userName,
  userEmail,
  message,
  hasSnapshot,
}: {
  reportId: string;
  userName: string | null;
  userEmail: string;
  message: string;
  hasSnapshot: boolean;
}) => {
  const sender = userName ? `${escapeHtml(userName)} — ${escapeHtml(userEmail)}` : escapeHtml(userEmail);
  const html = renderEmail({
    preheader: `Support message from ${userEmail}`,
    eyebrow: "Support",
    heading: "New support message",
    bodyHtml: `
<p style="margin:0 0 12px;"><strong>From:</strong> ${sender}</p>
<div style="margin:0 0 16px;padding:14px 16px;background:${palette.paper};border:1px solid ${palette.cardStroke};border-radius:12px;white-space:pre-wrap;">${escapeHtml(message)}</div>
<p style="margin:0;font-size:13px;color:${palette.muted};">Report ${escapeHtml(reportId)} · ${
      hasSnapshot
        ? "data snapshot attached — open it in the admin feedback view"
        : "no data snapshot"
    }.</p>
`,
  });

  await resend.emails.send({
    from: "support@circadium.app",
    to: "support@circadium.app",
    replyTo: userEmail,
    subject: `Support: ${message.slice(0, 60)}${message.length > 60 ? "…" : ""}`,
    html,
  });
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const resetLink = `${domain}/auth/new-password?token=${token}`;
  const html = renderEmail({
    preheader: "Reset your Circadium password",
    eyebrow: "Security",
    heading: "Reset your password",
    bodyHtml: `
<p style="margin:0 0 12px;">Click below to choose a new password for your Circadium account.</p>
<p style="margin:0;font-size:13px;color:${palette.muted};">If you didn&rsquo;t request a reset, you can ignore this email or contact support.</p>
`,
    cta: { label: "Reset password", href: resetLink },
  });

  await resend.emails.send({
    from: "support@circadium.app",
    to: email,
    subject: "Reset your password",
    html,
  });
};
