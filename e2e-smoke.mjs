/**
 * Smoke test - no auth required. Captures auth page and verifies basic structure.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://wardrobe-build.vercel.app';
const OUT = join(__dirname, 'e2e-auth-page.png');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.screenshot({ path: OUT, fullPage: true });
    const hasSignIn = await page.locator('button:has-text("Войти через Google")').isVisible();
    const hasTitle = await page.locator('text=Capsule').isVisible();
    console.log('Auth page screenshot:', OUT);
    console.log('Sign-in button visible:', hasSignIn);
    console.log('Title visible:', hasTitle);
  } finally {
    await browser.close();
  }
}

run();
