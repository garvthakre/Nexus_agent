/**
 * whatsappClient.ts — NEXUS WhatsApp Manager
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses whatsapp-web.js which reverse-engineered the WhatsApp Web protocol.
 * No browser automation, no bot detection issues.
 *
 * First run: shows QR code in terminal → scan with phone → session saved
 * Every run after: loads saved session, no QR needed
 *
 * Install: npm install whatsapp-web.js qrcode-terminal
 */

import * as path from 'path';
import * as fs from 'fs';

const SESSION_PATH = path.join(process.cwd(), 'whatsapp-session');

let clientInstance: any = null;
let clientReady = false;
let initPromise: Promise<void> | null = null;

// ─── Initialize WhatsApp Client ───────────────────────────────────────────────

export async function getWhatsAppClient(): Promise<any> {
  // Already ready — return immediately
  if (clientInstance && clientReady) return clientInstance;

  // Already initializing — wait for it
  if (initPromise) {
    await initPromise;
    return clientInstance;
  }

  initPromise = _initialize();
  await initPromise;
  return clientInstance;
}

async function _initialize(): Promise<void> {
  const { Client, LocalAuth } = await import('whatsapp-web.js');
  const qrcode = await import('qrcode-terminal');

  console.log('[WhatsApp] Initializing client...');

  clientInstance = new Client({
    authStrategy: new LocalAuth({
      dataPath: SESSION_PATH,
    }),
    puppeteer: {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--start-maximized', 
      ],
    },
  });

  // Show QR in terminal on first run
  clientInstance.on('qr', (qr: string) => {
    console.log('\n[WhatsApp] ══════════════════════════════════════════');
    console.log('[WhatsApp] Scan this QR code with your phone:');
    console.log('[WhatsApp] WhatsApp → Settings → Linked Devices → Link a Device');
    console.log('[WhatsApp] ══════════════════════════════════════════\n');
    qrcode.generate(qr, { small: true });
    console.log('\n[WhatsApp] Waiting for scan...');
  });

  clientInstance.on('authenticated', () => {
    console.log('[WhatsApp] ✓ Authenticated — session saved');
  });

  clientInstance.on('auth_failure', (msg: string) => {
    console.error('[WhatsApp] ✗ Auth failed:', msg);
    console.error('[WhatsApp] Delete whatsapp-session/ folder and try again');
    clientReady = false;
  });

  clientInstance.on('disconnected', (reason: string) => {
    console.warn('[WhatsApp] Disconnected:', reason);
    clientReady = false;
    clientInstance = null;
    initPromise = null;
  });

  // Wait for ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('[WhatsApp] Timeout waiting for client ready (60s). Check QR scan.'));
    }, 60_000);

    clientInstance.on('ready', () => {
      clearTimeout(timeout);
      clientReady = true;
      console.log('[WhatsApp] ✓ Client ready — connected to WhatsApp');
      resolve();
    });

    clientInstance.initialize().catch((err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ─── Find a contact by name ───────────────────────────────────────────────────

export async function findContact(client: any, name: string): Promise<any | null> {
  const contacts = await client.getContacts();
  const nameLower = name.toLowerCase().trim();

  // Exact match first
  let match = contacts.find((c: any) =>
    c.name?.toLowerCase() === nameLower ||
    c.pushname?.toLowerCase() === nameLower
  );

  // Partial match fallback
  if (!match) {
    match = contacts.find((c: any) =>
      c.name?.toLowerCase().includes(nameLower) ||
      c.pushname?.toLowerCase().includes(nameLower)
    );
  }

  return match ?? null;
}

// ─── Send a WhatsApp message ──────────────────────────────────────────────────

export async function sendWhatsAppMessage(
  contactName: string,
  message: string,
): Promise<{ success: boolean; message: string; to?: string }> {
  let client: any;

  try {
    client = await getWhatsAppClient();
  } catch (e) {
    throw new Error(
      `WhatsApp client failed to start: ${(e as Error).message}\n` +
      `Make sure you ran: npm install whatsapp-web.js qrcode-terminal`
    );
  }

  // Find contact
  const contact = await findContact(client, contactName);
  if (!contact) {
    // Try searching chats too
    const chats = await client.getChats();
    const chatMatch = chats.find((c: any) =>
      c.name?.toLowerCase().includes(contactName.toLowerCase())
    );

    if (!chatMatch) {
      throw new Error(
        `Contact "${contactName}" not found in WhatsApp.\n` +
        `Make sure the name matches exactly as it appears in your contacts.`
      );
    }

    await chatMatch.sendMessage(message);
    console.log(`[WhatsApp] ✓ Message sent to "${chatMatch.name}" via chat`);
    return {
      success: true,
      message: `Message sent to ${chatMatch.name}`,
      to: chatMatch.name,
    };
  }

  // Send message
  const chatId = contact.id._serialized;
  await client.sendMessage(chatId, message);

  console.log(`[WhatsApp] ✓ Message "${message}" sent to "${contact.name ?? contact.pushname}"`);
  return {
    success: true,
    message: `Message sent to ${contact.name ?? contact.pushname}`,
    to: contact.name ?? contact.pushname,
  };
}

// ─── Get recent chats ─────────────────────────────────────────────────────────

export async function getWhatsAppChats(limit = 10): Promise<any[]> {
  const client = await getWhatsAppClient();
  const chats = await client.getChats();
  return chats.slice(0, limit).map((c: any) => ({
    name: c.name,
    unread: c.unreadCount,
    lastMessage: c.lastMessage?.body?.slice(0, 100),
    timestamp: c.timestamp,
  }));
}