/**
 * LikeLink Owner Notifications
 * ==============================
 * Every important update goes to the owner's email.
 * Uses Resend (already integrated in the project).
 */

import { sendViaResend } from '../../api/invoice/send.mjs';

/**
 * Notify owner of important events.
 */
export async function notifyOwner({ subject, body, type = 'info', env = {} } = {}) {
  const ownerEmail = env.OWNER_EMAIL;
  if (!ownerEmail) return { ok: false, reason: 'no_owner_email' };

  const html = buildEmailHtml({ subject, body, type });

  try {
    const result = await sendViaResend({
      to: ownerEmail,
      subject: `[LikeLink] ${subject}`,
      html,
      env,
    });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

/**
 * Notify: new campaign created.
 */
export async function notifyCampaignCreated(campaign, { env } = {}) {
  const product = campaign?.productTitle || campaign?.title || 'מוצר';
  return notifyOwner({
    subject: `קמפיין חדש נוצר: ${product}`,
    type: 'success',
    body: {
      title: 'קמפיין חדש נוצר אוטומטית',
      lines: [
        `מוצר: ${product}`,
        `זווית: ${campaign?.angle || 'לא ידוע'}`,
        `ציון: ${campaign?.score || 0}`,
        `סטטוס: ${campaign?.status || 'WEB_LIVE'}`,
      ],
      cta: 'צפה בסטודיו',
    },
    env,
  });
}

/**
 * Notify: trending product detected.
 */
export async function notifyTrending(product, { env } = {}) {
  return notifyOwner({
    subject: `מוצר חם זוהה: ${product?.title}`,
    type: 'trending',
    body: {
      title: 'מוצר חם זוהה!',
      lines: [
        `מוצר: ${product?.title}`,
      ],
      cta: 'צפה בסטודיו',
    },
    env,
  });
}

/**
 * Notify: daily summary.
 */
export async function notifyDailySummary({ clicks, sales, campaigns, env } = {}) {
  return notifyOwner({
    subject: `סיכום יומי - ${new Date().toLocaleDateString('he-IL')}`,
    type: 'summary',
    body: {
      title: 'הסיכום היומי שלך',
      lines: [
        `קליקים היום: ${clicks || 0}`,
        `מכירות היום: ${sales || 0}`,
        `קמפיינים פעילים: ${campaigns || 0}`,
      ],
      cta: 'צפה בסטודיו',
    },
    env,
  });
}

function buildEmailHtml({ subject, body, type }) {
  const colors = {
    success: '#10b981',
    trending: '#f59e0b',
    warning: '#ef4444',
    info: '#6366f1',
    summary: '#8b5cf6',
  };
  const color = colors[type] || colors.info;

  return `
    <div style="font-family: 'Heebo', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; direction: rtl;">
      <div style="background: ${color}; color: white; padding: 20px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">${body.title}</h1>
      </div>
      <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 12px 12px;">
        <ul style="list-style: none; padding: 0;">
          ${body.lines.map((l) => `<li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${l}</li>`).join('')}
        </ul>
        ${body.cta ? `<a href="${body.ctaUrl || '#'}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: ${color}; color: white; text-decoration: none; border-radius: 8px;">${body.cta}</a>` : ''}
      </div>
    </div>
  `;
}
