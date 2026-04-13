import dotenv from 'dotenv';
dotenv.config();

export async function discordWebhook(message: string, embed?: any) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('⚠️  DISCORD_WEBHOOK_URL not set in .env');
    return;
  }

  const payload: any = {
    content: message,
    username: 'Jira AI Tracker',
    avatar_url: 'https://abadiaandres2020.atlassian.net/s/nufrgm/images/favicon.svg',
  };

  if (embed) {
    payload.embeds = [embed];
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Discord webhook failed: ${error}`);
  }

  return true;
}

export function desktopNotify(title: string, message: string) {
  return import('node-notifier').then(n => {
    n.default.notify({
      title,
      message,
      sound: true,
    });
  });
}