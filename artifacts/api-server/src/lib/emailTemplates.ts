const BRAND_GREEN = "#4A7C59";
const BRAND_COPPER = "#C1693A";
const BG_WARM = "#f9efe0";
const TEXT_DARK = "#2c2c2c";
const TEXT_MUTED = "#7a7a7a";

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; background: ${BG_WARM}; font-family: Georgia, 'Times New Roman', serif; color: ${TEXT_DARK}; }
    .container { max-width: 520px; margin: 0 auto; padding: 32px 20px; }
    .card { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1e3d2a 0%, #2a5438 60%, #3d6849 100%); padding: 28px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 32px; color: #fff; font-style: italic; }
    .header .emoji { font-size: 28px; }
    .body { padding: 32px; }
    .body p { margin: 0 0 16px; line-height: 1.7; font-size: 15px; color: ${TEXT_DARK}; }
    .cta-btn { display: inline-block; background: ${BRAND_GREEN}; color: #ffffff !important; text-decoration: none; padding: 14px 36px; border-radius: 14px; font-size: 16px; font-weight: 700; margin: 8px 0 16px; }
    .cta-btn:hover { background: #3d6849; }
    .footer { padding: 20px 32px; text-align: center; border-top: 1px solid #f0e8da; }
    .footer p { margin: 0; font-size: 12px; color: ${TEXT_MUTED}; line-height: 1.6; }
    .highlight { color: ${BRAND_COPPER}; font-weight: 600; }
    .group-badge { display: inline-block; background: ${BRAND_GREEN}15; color: ${BRAND_GREEN}; padding: 6px 16px; border-radius: 10px; font-size: 14px; font-weight: 600; margin: 8px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>Lucias Küche <span class="emoji">🍳</span></h1>
      </div>
      ${content}
    </div>
    <div style="text-align:center; margin-top:16px;">
      <p style="font-size:11px; color:${TEXT_MUTED};">Lucia's Küche – Rezepte, Kochplanung & Familie</p>
    </div>
  </div>
</body>
</html>`;
}

export function invitationEmail(opts: {
  inviterName: string;
  groupName: string;
  inviteLink: string;
  invitedEmail: string;
}): string {
  return baseLayout(`
      <div class="body">
        <p>Hallo! 👋</p>
        <p>
          Ich freue mich sehr, dich hiermit zu <span class="highlight">Lucia's Küche</span> einladen zu dürfen!
        </p>
        <p>
          Das ist ein Programm, das mein lieber Göttergatte in seiner Freizeit mit viel Begeisterung
          entwickelt hat. Ich bin überrascht, wie toll das funktioniert – ich habe meine gesammelten
          Werke dort nun in digitaler Form vorliegen und bin gespannt, wie sich das in unserem
          Küchenalltag bemerkbar macht.
        </p>
        <p>
          <span class="highlight">${opts.inviterName}</span> hat dich in die Gruppe
          <span class="group-badge">${opts.groupName}</span> eingeladen.
        </p>
        <p>
          Ich freue mich, wenn du auch Spaß dran hast! Gib mir gerne ein Feedback, wie es dir gefällt. 💛
        </p>
        <p style="text-align:center; margin: 24px 0;">
          <a href="${opts.inviteLink}" class="cta-btn" style="color:#ffffff;">Jetzt beitreten</a>
        </p>
        <p style="font-size:13px; color:${TEXT_MUTED};">
          Wenn der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br/>
          <a href="${opts.inviteLink}" style="color:${BRAND_GREEN}; word-break:break-all;">${opts.inviteLink}</a>
        </p>
        <p style="font-size:13px; color:${TEXT_MUTED};">
          Dieser Einladungslink ist 14 Tage gültig.
        </p>
      </div>
      <div class="footer">
        <p>Diese E-Mail wurde an ${opts.invitedEmail} gesendet,<br/>weil ${opts.inviterName} dich zu Lucia's Küche eingeladen hat.</p>
      </div>`);
}

export function confirmationEmail(opts: {
  inviterName: string;
  invitedEmail: string;
  groupName: string;
}): string {
  return baseLayout(`
      <div class="body">
        <p>Hallo ${opts.inviterName},</p>
        <p>
          deine Einladung an <span class="highlight">${opts.invitedEmail}</span> für die Gruppe
          <span class="group-badge">${opts.groupName}</span> wurde erfolgreich versandt! ✉️
        </p>
        <p>
          Sobald die eingeladene Person beitritt, wirst du benachrichtigt.
        </p>
      </div>
      <div class="footer">
        <p>Lucia's Küche – Einladungsbestätigung</p>
      </div>`);
}

export function joinedNotificationEmail(opts: {
  inviterName: string;
  joinedUserName: string;
  groupName: string;
}): string {
  return baseLayout(`
      <div class="body">
        <p>Hallo ${opts.inviterName},</p>
        <p>
          Tolle Neuigkeiten! 🎉 <span class="highlight">${opts.joinedUserName}</span> hat deine
          Einladung angenommen und ist der Gruppe <span class="group-badge">${opts.groupName}</span> beigetreten.
        </p>
        <p>
          Ihr könnt jetzt gemeinsam Rezepte teilen und Kochabende planen!
        </p>
      </div>
      <div class="footer">
        <p>Lucia's Küche – Beitrittsbenachrichtigung</p>
      </div>`);
}

export function addedToGroupEmail(opts: {
  inviterName: string;
  invitedName: string;
  groupName: string;
}): string {
  return baseLayout(`
      <div class="body">
        <p>Hallo ${opts.invitedName},</p>
        <p>
          <span class="highlight">${opts.inviterName}</span> hat dich zur Gruppe
          <span class="group-badge">${opts.groupName}</span> in Lucia's Küche hinzugefügt! 🎉
        </p>
        <p>
          Du kannst dich jetzt einloggen und gemeinsam Rezepte teilen und Kochabende planen.
        </p>
      </div>
      <div class="footer">
        <p>Lucia's Küche – Gruppenbenachrichtigung</p>
      </div>`);
}

export function mealReminderEmail(opts: {
  hostName: string;
  date: string;
  time?: string | null;
  appLink: string;
  guestEmail: string;
}): string {
  const timeInfo = opts.time ? ` um <span class="highlight">${opts.time} Uhr</span>` : "";
  return baseLayout(`
      <div class="body">
        <p>Hallo! 👋</p>
        <p>
          <span class="highlight">${opts.hostName}</span> erinnert dich an den gemeinsamen Kochabend:
        </p>
        <p>
          📅 Datum: <span class="highlight">${opts.date}</span>${timeInfo}
        </p>
        <p>
          Bitte teile noch mit, ob du dabei sein kannst – deine Antwort steht noch aus.
        </p>
        <p style="text-align:center; margin: 24px 0;">
          <a href="${opts.appLink}" class="cta-btn" style="color:#ffffff;">Zur Einladung</a>
        </p>
        <p style="font-size:13px; color:${TEXT_MUTED};">
          Wenn der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br/>
          <a href="${opts.appLink}" style="color:${BRAND_GREEN}; word-break:break-all;">${opts.appLink}</a>
        </p>
      </div>
      <div class="footer">
        <p>Diese Erinnerung wurde an ${opts.guestEmail} gesendet.</p>
      </div>`);
}

export function reminderEmail(opts: {
  inviterName: string;
  groupName: string;
  inviteLink: string;
  invitedEmail: string;
}): string {
  return baseLayout(`
      <div class="body">
        <p>Hallo! 👋</p>
        <p>
          Nur eine kleine Erinnerung: <span class="highlight">${opts.inviterName}</span> hat dich
          eingeladen, der Gruppe <span class="group-badge">${opts.groupName}</span> in
          <span class="highlight">Lucia's Küche</span> beizutreten.
        </p>
        <p>
          Falls du es noch nicht geschafft hast – der Link ist weiterhin gültig:
        </p>
        <p style="text-align:center; margin: 24px 0;">
          <a href="${opts.inviteLink}" class="cta-btn" style="color:#ffffff;">Jetzt beitreten</a>
        </p>
        <p style="font-size:13px; color:${TEXT_MUTED};">
          Dieser Einladungslink ist ab jetzt noch 14 Tage gültig.
        </p>
      </div>
      <div class="footer">
        <p>Diese Erinnerung wurde an ${opts.invitedEmail} gesendet.</p>
      </div>`);
}
